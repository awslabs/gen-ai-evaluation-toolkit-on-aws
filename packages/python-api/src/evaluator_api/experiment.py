"""Experiment lifecycle: pre-processing and post-processing for MLflow integration.

Pre-processing (inline, on status=RUNNING):
  - Create MLflow experiment if it doesn't exist
  - Create a run within the experiment
  - Log params from the job/report

Post-processing (async, triggered by EventBridge on SCORING_COMPLETE):
  - Aggregate scores from DynamoDB ResultItems using Welford's online algorithm
  - Log aggregated metrics to MLflow
  - Store aggregated metrics on the ReportItem
  - Terminate the MLflow run
  - Transition the job status to COMPLETED
"""

import json
import math
import os
import re
import tempfile
from html import escape
from logging import getLogger
from typing import Any, Optional

from evaluator_api.ddb import JobDao, JobItem, ReportDao, ReportItem, ResultDao, ResultItem
from evaluator_api.ddb.common import decimals_to_float

logger = getLogger(__name__)




def start_experiment_run(
    job: JobItem,
    report: Optional[ReportItem],
) -> None:
    """Create MLflow experiment (if needed), create a run, and log params.

    Called inline during the status update to RUNNING. Importing mlflow_client
    lazily so that when MLFLOW_TRACKING_SERVER_ARN is not set (e.g. tests
    without MLflow), the module can still be imported.
    """
    from evaluator_api.mlflow_client import (
        create_run,
        find_run_by_name,
        get_or_create_experiment,
        log_params,
    )

    experiment_name = job.experiment_name
    if not experiment_name:
        return

    experiment = get_or_create_experiment(experiment_name)

    # Use job_id as the run name — idempotent: reuse existing run if one exists
    # (guard against EventBridge at-least-once delivery duplicates)
    try:
        run_id = find_run_by_name(experiment.experiment_id, job.job_id)
        logger.info("Reusing existing run '%s' for job %s", run_id, job.job_id)
    except ValueError:
        run = create_run(experiment.experiment_id, run_name=job.job_id)
        run_id = run.info.run_id

    params: dict[str, str] = {
        "etk.evaluator_name": job.evaluator_name,
        "etk.job_id": job.job_id,
        "etk.job_type": job.job_type,
        "etk.report_id": job.report_id,
    }
    if job.dataset_id:
        params["etk.dataset_id"] = job.dataset_id
    if job.source_report_id:
        params["etk.source_report_id"] = job.source_report_id

    if job.scorers:
        params["etk.scorers"] = ",".join(sorted(job.scorers.keys()))
        for scorer_name, scorer_config in job.scorers.items():
            if isinstance(scorer_config, dict) and scorer_config.get("scores"):
                sub_scores = sorted(scorer_config["scores"].keys())
                params[f"etk.scorers.{scorer_name}.sub_scores"] = ",".join(sub_scores)

    if report and report.name:
        params["etk.report_name"] = report.name

    log_params(run_id, params)
    logger.info("Pre-processing complete for job %s, run_id=%s", job.job_id, run_id)


def _should_continue(context: Any, buffer_ms: int) -> bool:
    """Check if we're approaching Lambda timeout and should CONTINUE."""
    return (
        context is not None
        and hasattr(context, "get_remaining_time_in_millis")
        and context.get_remaining_time_in_millis() < buffer_ms
    )


class WelfordAccumulator:
    """Streaming statistics using Welford's online algorithm.

    Tracks count, mean, m2 (for variance), min, and max.
    Memory usage is O(1) regardless of the number of samples.
    """

    __slots__ = ("count", "mean", "m2", "min_val", "max_val")

    def __init__(self) -> None:
        self.count: int = 0
        self.mean: float = 0.0
        self.m2: float = 0.0
        self.min_val: float = float("inf")
        self.max_val: float = float("-inf")

    def update(self, value: float) -> None:
        self.count += 1
        delta = value - self.mean
        self.mean += delta / self.count
        delta2 = value - self.mean
        self.m2 += delta * delta2
        self.min_val = min(self.min_val, value)
        self.max_val = max(self.max_val, value)

    @property
    def variance(self) -> float:
        if self.count < 2:
            return 0.0
        return self.m2 / (self.count - 1)

    @property
    def std_dev(self) -> float:
        return math.sqrt(self.variance)

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "WelfordAccumulator":
        """Restore from a checkpoint dict (round-trips with to_dict)."""
        acc = cls()
        acc.count = int(d.get("count", 0))
        acc.mean = float(d.get("mean", 0))
        acc.m2 = float(d.get("m2", 0))
        acc.min_val = float(d["min_val"]) if d.get("min_val") is not None else float("inf")
        acc.max_val = float(d["max_val"]) if d.get("max_val") is not None else float("-inf")
        return acc

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dict. Includes internal state (m2, min_val, max_val)
        for checkpoint round-tripping, plus display keys (min, max, standardDeviation)
        for report storage.
        """
        def _safe(v: float) -> float | None:
            """Replace NaN/Inf with None (DDB Decimal rejects them)."""
            return None if (math.isnan(v) or math.isinf(v)) else v

        return {
            "count": self.count,
            "mean": _safe(self.mean),
            "m2": _safe(self.m2),
            "min": _safe(self.min_val) if self.count > 0 else None,
            "max": _safe(self.max_val) if self.count > 0 else None,
            "min_val": _safe(self.min_val) if self.count > 0 else None,
            "max_val": _safe(self.max_val) if self.count > 0 else None,
            "standardDeviation": _safe(self.std_dev),
        }


def sanitize_metric_name(name: str) -> str:
    """Sanitize metric name for MLflow compatibility.

    MLflow allows: alphanumerics, underscores, dashes, periods, spaces, colons, slashes.
    """
    sanitized = re.sub(r"[^a-zA-Z0-9_\-.: /]", "_", name)
    sanitized = re.sub(r"_+", "_", sanitized)
    return sanitized


def fetch_all_results(result_dao: ResultDao, report_id: str) -> list[ResultItem]:
    """Paginate through all ResultItems for a report and return as a list."""
    all_results: list[ResultItem] = []
    next_token: Optional[str] = None
    while True:
        results, next_token = result_dao.query_by_report(report_id, next_token=next_token)
        all_results.extend(results)
        if not next_token:
            break
    return all_results


def aggregate_scores(results: list[ResultItem]) -> dict[str, WelfordAccumulator]:
    """Aggregate scores across results using Welford's algorithm.

    Returns:
        Dict mapping score_name to WelfordAccumulator with aggregated stats.
    """
    accumulators: dict[str, WelfordAccumulator] = {}
    for result in results:
        if not result.scores:
            continue
        for score_name, score_model in result.scores.items():
            if score_model.value is None:
                continue
            value = float(score_model.value)
            if score_name not in accumulators:
                accumulators[score_name] = WelfordAccumulator()
            accumulators[score_name].update(value)

    logger.info("Aggregated scores from %d results, %d distinct score names", len(results), len(accumulators))
    return accumulators


def build_aggregated_metrics(accumulators: dict[str, WelfordAccumulator]) -> dict[str, Any]:
    """Build aggregated metrics dict for storage on ReportItem."""
    return {name: acc.to_dict() for name, acc in accumulators.items()}


def build_mlflow_metrics(accumulators: dict[str, WelfordAccumulator]) -> dict[str, float]:
    """Build flat metric dict for MLflow logging.

    Creates metrics like: score_name_mean, score_name_min, score_name_max, etc.
    """
    metrics: dict[str, float] = {}
    for name, acc in accumulators.items():
        if acc.count == 0:
            continue
        sanitized = sanitize_metric_name(name)
        entries = {
            f"{sanitized}_count": float(acc.count),
            f"{sanitized}_mean": acc.mean,
            f"{sanitized}_min": acc.min_val,
            f"{sanitized}_max": acc.max_val,
            f"{sanitized}_standardDeviation": acc.std_dev,
        }
        # Skip NaN/Inf values — MLflow rejects them
        for k, v in entries.items():
            if not (math.isnan(v) or math.isinf(v)):
                metrics[k] = v
    return metrics


RESULTS_JSON_PATH = "Test Case Results Json"
RESULTS_HTML_PATH = "Test Case Results HTML"


def _result_to_dict(result: ResultItem) -> dict[str, Any]:
    """Convert a ResultItem to a serialisable dict for artifact logging."""
    d: dict[str, Any] = {"result_id": result.result_id}
    if result.testcase_id is not None:
        d["testcase_id"] = result.testcase_id
    if result.input is not None:
        d["input"] = result.input
    if result.output is not None:
        d["output"] = result.output
    if result.expected is not None:
        d["expected"] = result.expected
    if result.context is not None:
        d["context"] = result.context
    if result.scores:
        d["scores"] = {
            name: score.model_dump(exclude_none=True)
            for name, score in result.scores.items()
        }
    if result.app_metrics:
        d["app_metrics"] = result.app_metrics
    if result.metadata is not None:
        d["metadata"] = result.metadata
    if result.error:
        d["error"] = result.error
    return decimals_to_float(d)  # type: ignore[no-any-return]


def _format_value(value: Any) -> str:
    """Format a value for HTML display."""
    if isinstance(value, float):
        if abs(value) >= 1000 or (0 < abs(value) < 0.001):
            return f"{value:.3e}"
        return f"{value:.4g}"
    if isinstance(value, dict):
        return json.dumps(value, indent=2, default=str)
    if isinstance(value, list):
        return json.dumps(value, indent=2, default=str)
    return str(value)


def _result_to_html(result_dict: dict[str, Any]) -> str:
    """Build an HTML page for a single result."""
    rows = ""
    for key, value in result_dict.items():
        if key == "result_id":
            continue
        if key == "scores" and isinstance(value, dict):
            score_parts = []
            for score_name, score_data in value.items():
                val = score_data.get("value", "")
                reason = score_data.get("reason", "")
                line = f"<strong>{escape(score_name)}</strong>: {escape(_format_value(val))}"
                if reason:
                    line += f" <em>({escape(str(reason))})</em>"
                score_parts.append(line)
            cell = "<br>".join(score_parts)
        else:
            cell = f"<pre>{escape(_format_value(value))}</pre>"
        rows += f"<tr><th>{escape(key)}</th><td>{cell}</td></tr>\n"

    return f"""<!DOCTYPE html>
<html>
<head><style>
  body {{ font-family: Arial, sans-serif; margin: 20px; }}
  table {{ border-collapse: collapse; width: 100%; }}
  th, td {{ border: 1px solid #ddd; padding: 10px; text-align: left; vertical-align: top; }}
  th {{ background: #f2f2f2; width: 150px; }}
  pre {{ margin: 0; white-space: pre-wrap; word-wrap: break-word; font-size: 12px; }}
</style></head>
<body>
<h2>Result {escape(result_dict.get('result_id', ''))}</h2>
<table>{rows}</table>
</body></html>"""


def log_result_artifacts(run_id: str, results: list[ResultItem]) -> int:
    """Log per-result JSON and HTML artifacts to MLflow.

    Writes each result as a JSON file and an HTML file.
    Returns the number of results logged.
    """
    from evaluator_api.mlflow_client import log_artifact

    count = 0
    with tempfile.TemporaryDirectory() as temp_dir:
        for result in results:
            result_dict = _result_to_dict(result)
            filename = f"{result.result_id}"

            json_path = os.path.join(temp_dir, f"{filename}.json")
            with open(json_path, "w") as f:
                json.dump(result_dict, f, indent=2, default=str)
            log_artifact(run_id, json_path, RESULTS_JSON_PATH)

            html_path = os.path.join(temp_dir, f"{filename}.html")
            with open(html_path, "w", encoding="utf-8") as f:
                f.write(_result_to_html(result_dict))
            log_artifact(run_id, html_path, RESULTS_HTML_PATH)

            count += 1

    logger.info("Logged %d result artifacts", count)
    return count


def run_post_processing(
    *,
    job_dao: JobDao,
    result_dao: ResultDao,
    report_dao: ReportDao,
    job_id: str,
    checkpoint: dict[str, Any] | None = None,
    context: Any = None,
    task_token: str | None = None,
    task_key: str = "post_process",
    continue_buffer_ms: int | None = None,
) -> str:
    """Run post-processing for a completed scoring job.

    Single streaming pass: paginate results, accumulate Welford stats,
    and log MLflow artifacts per-result. Constant memory O(scores).
    Supports checkpoint/CONTINUE for large datasets.

    Returns "COMPLETED" or "CONTINUE".
    Job status transition is handled by the caller via complete_task().
    """
    import time as _time

    from evaluator_api.sfn import get_sfn_client
    from evaluator_api.task_lifecycle import TaskCheckpoint, checkpoint_task

    job = job_dao.get(job_id)
    if not job:
        raise ValueError(f"Job '{job_id}' not found")

    report_id = job.report_id

    # Resume from checkpoint
    resume = TaskCheckpoint.model_validate(checkpoint) if checkpoint else TaskCheckpoint()
    last_key = resume.last_evaluated_key
    accumulators: dict[str, WelfordAccumulator] = {}
    if resume.welford:
        accumulators = {name: WelfordAccumulator.from_dict(state) for name, state in resume.welford.items()}

    # Set up MLflow run (if experiment configured) before streaming
    mlflow_run_id: str | None = None
    if job.experiment_name:
        mlflow_run_id = _setup_mlflow_run(job)

    last_heartbeat_t = _time.monotonic()
    heartbeat_interval_s = 60
    effective_buffer_ms = continue_buffer_ms or 60_000

    # Single streaming pass: aggregate + log artifacts per result
    while True:
        results, next_token = result_dao.query_by_report(report_id, max_results=20, next_token=last_key)

        for result in results:
            # Welford aggregation
            if result.scores:
                for score_name, score_model in result.scores.items():
                    if score_model.value is None:
                        continue
                    if score_name not in accumulators:
                        accumulators[score_name] = WelfordAccumulator()
                    accumulators[score_name].update(float(score_model.value))

            # Stream artifact to MLflow (one at a time, constant memory)
            if mlflow_run_id:
                try:
                    _log_single_result_artifact(mlflow_run_id, result)
                except Exception:
                    logger.warning("Failed to log artifact for result %s", result.result_id)

        last_key = next_token

        # Heartbeat at page boundary
        if task_token and _time.monotonic() - last_heartbeat_t > heartbeat_interval_s:
            try:
                get_sfn_client().send_task_heartbeat(taskToken=task_token)
            except Exception:
                logger.warning("Heartbeat failed for job %s (task may have timed out)", job_id)
            last_heartbeat_t = _time.monotonic()

        if not next_token:
            break

        # CONTINUE at page boundary if approaching timeout
        if _should_continue(context, effective_buffer_ms):
            welford_state = {n: a.to_dict() for n, a in accumulators.items()}
            continue_cp = TaskCheckpoint(
                last_evaluated_key=last_key, welford=welford_state,
            )
            checkpoint_task(job_id, task_key, continue_cp, task_token=task_token)
            logger.info("Post-processing CONTINUE for job %s", job_id)
            return "CONTINUE"

    # Final: store aggregated metrics
    aggregated = build_aggregated_metrics(accumulators)
    if aggregated:
        report_dao.update_aggregated_metrics(report_id, aggregated)
        logger.info("Stored aggregated metrics on report %s", report_id)

    # Final: log MLflow metrics + terminate run
    if mlflow_run_id:
        _finalize_mlflow_run(job, mlflow_run_id, accumulators)

    logger.info("Post-processing complete for job %s", job_id)
    return "COMPLETED"


def _setup_mlflow_run(job: JobItem) -> str | None:
    """Find the MLflow run for this job. Returns run_id or None."""
    from evaluator_api.mlflow_client import find_run_by_name, get_or_create_experiment

    if not job.experiment_name:
        return None
    try:
        experiment = get_or_create_experiment(job.experiment_name)
        return find_run_by_name(experiment.experiment_id, job.job_id)
    except Exception:
        logger.exception("Failed to set up MLflow run for job %s", job.job_id)
        return None


def _log_single_result_artifact(run_id: str, result: ResultItem) -> None:
    """Log a single result as JSON + HTML artifacts to MLflow. O(1) memory."""
    from evaluator_api.mlflow_client import log_artifact

    result_dict = _result_to_dict(result)
    filename = result.result_id

    with tempfile.TemporaryDirectory() as temp_dir:
        json_path = os.path.join(temp_dir, f"{filename}.json")
        with open(json_path, "w") as f:
            json.dump(result_dict, f, indent=2, default=str)
        log_artifact(run_id, json_path, RESULTS_JSON_PATH)

        html_path = os.path.join(temp_dir, f"{filename}.html")
        with open(html_path, "w", encoding="utf-8") as f:
            f.write(_result_to_html(result_dict))
        log_artifact(run_id, html_path, RESULTS_HTML_PATH)


def _finalize_mlflow_run(
    job: JobItem,
    run_id: str,
    accumulators: dict[str, WelfordAccumulator],
) -> None:
    """Log aggregated metrics and terminate the MLflow run."""
    from evaluator_api.mlflow_client import log_metrics, terminate_run

    try:
        mlflow_metrics = build_mlflow_metrics(accumulators)
        if mlflow_metrics:
            log_metrics(run_id, mlflow_metrics)
        terminate_run(run_id, status="FINISHED")
        logger.info("MLflow run finalized for job %s", job.job_id)
    except Exception:
        logger.exception("Failed to finalize MLflow for job %s", job.job_id)
