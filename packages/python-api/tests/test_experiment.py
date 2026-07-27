"""Tests for experiment lifecycle: pre-processing, aggregation, post-processing, and artifacts."""

import json
import math
from decimal import Decimal
from typing import Optional
from unittest.mock import MagicMock, patch

import pytest

from evaluator_api.ddb.models import JobItem, JobStatus, ReportItem, ResultItem, ScoreItemModel
from evaluator_api.experiment import (
    WelfordAccumulator,
    _result_to_dict,
    _result_to_html,
    aggregate_scores,
    build_aggregated_metrics,
    build_mlflow_metrics,
    fetch_all_results,
    log_result_artifacts,
    run_post_processing,
    sanitize_metric_name,
    start_experiment_run,
)

# WelfordAccumulator unit tests


class TestWelfordAccumulator:
    def test_empty(self) -> None:
        acc = WelfordAccumulator()
        assert acc.count == 0
        assert acc.mean == 0.0
        assert acc.std_dev == 0.0
        result = acc.to_dict()
        assert result["count"] == 0
        assert result["min"] is None

    def test_single_value(self) -> None:
        acc = WelfordAccumulator()
        acc.update(5.0)
        assert acc.count == 1
        assert acc.mean == 5.0
        assert acc.min_val == 5.0
        assert acc.max_val == 5.0
        assert acc.std_dev == 0.0

    def test_known_values(self) -> None:
        acc = WelfordAccumulator()
        values = [2.0, 4.0, 4.0, 4.0, 5.0, 5.0, 7.0, 9.0]
        for v in values:
            acc.update(v)
        assert acc.count == 8
        assert acc.mean == 5.0
        assert acc.min_val == 2.0
        assert acc.max_val == 9.0
        # Population variance = 4.0, sample variance = 4.571...
        expected_var = sum((x - 5.0) ** 2 for x in values) / (len(values) - 1)
        assert abs(acc.variance - expected_var) < 1e-10
        assert abs(acc.std_dev - math.sqrt(expected_var)) < 1e-10

    def test_to_dict(self) -> None:
        acc = WelfordAccumulator()
        acc.update(1.0)
        acc.update(3.0)
        d = acc.to_dict()
        assert d["count"] == 2
        assert d["mean"] == 2.0
        assert d["min"] == 1.0
        assert d["max"] == 3.0
        assert "standardDeviation" in d

    def test_to_dict_nan_inf_replaced_with_none(self) -> None:
        acc = WelfordAccumulator()
        acc.update(float("inf"))
        d = acc.to_dict()
        assert d["mean"] is None
        assert d["min"] is None
        assert d["max"] is None


# sanitize_metric_name


class TestSanitizeMetricName:
    def test_alphanumeric_passthrough(self) -> None:
        assert sanitize_metric_name("accuracy_score") == "accuracy_score"

    def test_special_chars_replaced(self) -> None:
        assert sanitize_metric_name("score(mode=test)") == "score_mode_test_"

    def test_collapses_underscores(self) -> None:
        assert sanitize_metric_name("a___b") == "a_b"


# aggregate_scores


class TestFetchAllResults:
    def test_pagination(self) -> None:
        page1 = [ResultItem(report_id="r1", result_id="res1", created_at="2024-01-01T00:00:00Z")]
        page2 = [ResultItem(report_id="r1", result_id="res2", created_at="2024-01-01T00:00:00Z")]
        dao = MagicMock()
        dao.query_by_report.side_effect = [(page1, "token"), (page2, None)]
        results = fetch_all_results(dao, "r1")
        assert len(results) == 2
        assert dao.query_by_report.call_count == 2


class TestAggregateScores:
    def test_empty(self) -> None:
        assert aggregate_scores([]) == {}

    def test_single_result_single_score(self) -> None:
        results = [
            ResultItem(
                report_id="r1", result_id="res1", created_at="2024-01-01T00:00:00Z",
                scores={"accuracy": ScoreItemModel(value=0.9)},
            ),
        ]
        accs = aggregate_scores(results)
        assert "accuracy" in accs
        assert accs["accuracy"].count == 1
        assert accs["accuracy"].mean == 0.9

    def test_multiple_results_multiple_scores(self) -> None:
        results = [
            ResultItem(
                report_id="r1", result_id=f"res{i}", created_at="2024-01-01T00:00:00Z",
                scores={
                    "accuracy": ScoreItemModel(value=float(v)),
                    "f1": ScoreItemModel(value=float(v) * 0.8),
                },
            )
            for i, v in enumerate([0.8, 0.9, 1.0])
        ]
        accs = aggregate_scores(results)
        assert accs["accuracy"].count == 3
        assert abs(accs["accuracy"].mean - 0.9) < 1e-10
        assert accs["accuracy"].min_val == 0.8
        assert accs["accuracy"].max_val == 1.0
        assert accs["f1"].count == 3

    def test_skips_none_scores(self) -> None:
        results = [
            ResultItem(
                report_id="r1", result_id="res1", created_at="2024-01-01T00:00:00Z",
                scores={"accuracy": ScoreItemModel(value=0.9)},
            ),
            ResultItem(
                report_id="r1", result_id="res2", created_at="2024-01-01T00:00:00Z",
                scores={"accuracy": ScoreItemModel(value=None, error="timeout")},
            ),
        ]
        accs = aggregate_scores(results)
        assert accs["accuracy"].count == 1

    def test_skips_results_without_scores(self) -> None:
        results = [
            ResultItem(report_id="r1", result_id="res1", created_at="2024-01-01T00:00:00Z"),
            ResultItem(
                report_id="r1", result_id="res2", created_at="2024-01-01T00:00:00Z",
                scores={"accuracy": ScoreItemModel(value=0.5)},
            ),
        ]
        accs = aggregate_scores(results)
        assert accs["accuracy"].count == 1
        assert accs["accuracy"].mean == 0.5

    def test_handles_decimal_values(self) -> None:
        results = [
            ResultItem(
                report_id="r1", result_id="res1", created_at="2024-01-01T00:00:00Z",
                scores={"accuracy": ScoreItemModel(value=Decimal("0.85"))},
            ),
        ]
        accs = aggregate_scores(results)
        assert accs["accuracy"].mean == 0.85


# build_mlflow_metrics


class TestBuildMlflowMetrics:
    def test_generates_five_metrics_per_score(self) -> None:
        acc = WelfordAccumulator()
        acc.update(1.0)
        acc.update(3.0)
        metrics = build_mlflow_metrics({"accuracy": acc})
        assert "accuracy_count" in metrics
        assert "accuracy_mean" in metrics
        assert "accuracy_min" in metrics
        assert "accuracy_max" in metrics
        assert "accuracy_standardDeviation" in metrics
        assert metrics["accuracy_count"] == 2.0
        assert metrics["accuracy_mean"] == 2.0

    def test_skips_empty_accumulators(self) -> None:
        acc = WelfordAccumulator()
        metrics = build_mlflow_metrics({"empty": acc})
        assert metrics == {}

    def test_skips_nan_inf_values(self) -> None:
        acc = WelfordAccumulator()
        acc.update(float("inf"))
        metrics = build_mlflow_metrics({"bad": acc})
        # count=1 is valid, but mean/min/max are inf — should be skipped
        assert "bad_count" in metrics
        assert "bad_mean" not in metrics
        assert "bad_min" not in metrics
        assert "bad_max" not in metrics


# build_aggregated_metrics


class TestBuildAggregatedMetrics:
    def test_builds_dict(self) -> None:
        acc = WelfordAccumulator()
        acc.update(0.5)
        acc.update(1.5)
        result = build_aggregated_metrics({"score_a": acc})
        assert "score_a" in result
        assert result["score_a"]["count"] == 2
        assert result["score_a"]["mean"] == 1.0


# start_experiment_run (pre-processing)


class TestStartExperimentRun:
    def test_no_experiment_name_is_noop(self) -> None:
        job = JobItem(
            evaluator_name="eval1", job_id="j1", job_type="FULL",
            report_id="r1", created_at="2024-01-01T00:00:00Z",
        )
        # Should not raise even without MLflow configured
        start_experiment_run(job=job, report=None)

    @patch("evaluator_api.mlflow_client.log_params")
    @patch("evaluator_api.mlflow_client.create_run")
    @patch("evaluator_api.mlflow_client.find_run_by_name", side_effect=ValueError("not found"))
    @patch("evaluator_api.mlflow_client.get_or_create_experiment")
    def test_creates_experiment_and_run(
        self, mock_get_exp: MagicMock, mock_find_run: MagicMock, mock_create_run: MagicMock, mock_log_params: MagicMock
    ) -> None:
        mock_experiment = MagicMock()
        mock_experiment.experiment_id = "exp-123"
        mock_get_exp.return_value = mock_experiment

        mock_run = MagicMock()
        mock_run.info.run_id = "run-456"
        mock_create_run.return_value = mock_run

        job = JobItem(
            evaluator_name="eval1", job_id="j1", job_type="FULL",
            report_id="r1", experiment_name="my-experiment",
            created_at="2024-01-01T00:00:00Z",
            dataset_id="ds-1",
            scorers={"exact_match": None, "ragas": {"params": {"model": "nova"}}},
        )
        report = ReportItem(report_id="r1", created_at="2024-01-01T00:00:00Z", name="My Report")

        start_experiment_run(job=job, report=report)

        mock_get_exp.assert_called_once_with("my-experiment")
        mock_create_run.assert_called_once_with("exp-123", run_name="j1")

        logged_params = mock_log_params.call_args[0]
        assert logged_params[0] == "run-456"
        params = logged_params[1]
        assert params["etk.evaluator_name"] == "eval1"
        assert params["etk.dataset_id"] == "ds-1"
        assert params["etk.report_name"] == "My Report"
        assert "exact_match" in params["etk.scorers"]
        assert "ragas" in params["etk.scorers"]


# run_post_processing


class TestRunPostProcessing:
    def _make_job(self, experiment_name: Optional[str] = None) -> JobItem:
        return JobItem(
            evaluator_name="eval1", job_id="j1", job_type="FULL",
            report_id="r1", experiment_name=experiment_name,
            status=JobStatus.SUCCESS,
            created_at="2024-01-01T00:00:00Z",
        )

    def _make_results(self) -> list[ResultItem]:
        return [
            ResultItem(
                report_id="r1", result_id=f"res{i}", created_at="2024-01-01T00:00:00Z",
                scores={"accuracy": ScoreItemModel(value=v)},
            )
            for i, v in enumerate([0.8, 0.9, 1.0])
        ]

    def test_aggregates_and_completes_without_mlflow(self) -> None:
        """Post-processing without experiment_name: aggregate + COMPLETED, no MLflow."""
        job = self._make_job(experiment_name=None)
        results = self._make_results()

        job_dao = MagicMock()
        job_dao.get.return_value = job
        result_dao = MagicMock()
        result_dao.query_by_report.return_value = (results, None)
        report_dao = MagicMock()

        run_post_processing(
            job_dao=job_dao, result_dao=result_dao, report_dao=report_dao,
            job_id="j1",
        )

        # Should store aggregated metrics on the report
        report_dao.update_aggregated_metrics.assert_called_once()
        call_args = report_dao.update_aggregated_metrics.call_args
        assert call_args[0][0] == "r1"
        metrics = call_args[0][1]
        assert "accuracy" in metrics
        assert metrics["accuracy"]["count"] == 3
        assert abs(metrics["accuracy"]["mean"] - 0.9) < 1e-10

        # Status transition is now handled by the caller (complete_task),
        # not by run_post_processing itself.
        job_dao.update_status.assert_not_called()

    @patch("evaluator_api.mlflow_client.terminate_run")
    @patch("evaluator_api.mlflow_client.log_artifact")
    @patch("evaluator_api.mlflow_client.log_metrics")
    @patch("evaluator_api.mlflow_client.find_run_by_name")
    @patch("evaluator_api.mlflow_client.get_or_create_experiment")
    def test_logs_to_mlflow_when_experiment_configured(
        self,
        mock_get_exp: MagicMock,
        mock_find_run: MagicMock,
        mock_log_metrics: MagicMock,
        mock_log_artifact: MagicMock,
        mock_terminate: MagicMock,
    ) -> None:
        mock_experiment = MagicMock()
        mock_experiment.experiment_id = "exp-123"
        mock_get_exp.return_value = mock_experiment
        mock_find_run.return_value = "run-456"

        job = self._make_job(experiment_name="my-experiment")
        results = self._make_results()

        job_dao = MagicMock()
        job_dao.get.return_value = job
        result_dao = MagicMock()
        result_dao.query_by_report.return_value = (results, None)
        report_dao = MagicMock()

        run_post_processing(
            job_dao=job_dao, result_dao=result_dao, report_dao=report_dao,
            job_id="j1",
        )

        # MLflow should be called
        mock_get_exp.assert_called_once_with("my-experiment")
        mock_find_run.assert_called_once_with("exp-123", "j1")
        mock_log_metrics.assert_called_once()
        mock_terminate.assert_called_once_with("run-456", status="FINISHED")

        # Metrics should include accuracy stats
        logged_metrics = mock_log_metrics.call_args[0][1]
        assert "accuracy_mean" in logged_metrics
        assert "accuracy_count" in logged_metrics

        # Artifacts: 3 results × 2 (JSON + HTML) = 6 log_artifact calls
        assert mock_log_artifact.call_count == 6

    @patch("evaluator_api.mlflow_client.get_or_create_experiment")
    def test_mlflow_failure_does_not_block_completion(self, mock_get_exp: MagicMock) -> None:
        """MLflow errors should be logged but not prevent job completion."""
        mock_get_exp.side_effect = RuntimeError("MLflow unreachable")

        job = self._make_job(experiment_name="my-experiment")
        results = self._make_results()

        job_dao = MagicMock()
        job_dao.get.return_value = job
        result_dao = MagicMock()
        result_dao.query_by_report.return_value = (results, None)
        report_dao = MagicMock()

        run_post_processing(
            job_dao=job_dao, result_dao=result_dao, report_dao=report_dao,
            job_id="j1",
        )

        # Should still store metrics
        report_dao.update_aggregated_metrics.assert_called_once()
        # Status transition handled by caller
        job_dao.update_status.assert_not_called()

    def test_empty_results_still_completes(self) -> None:
        job = self._make_job()
        job_dao = MagicMock()
        job_dao.get.return_value = job
        result_dao = MagicMock()
        result_dao.query_by_report.return_value = ([], None)
        report_dao = MagicMock()

        run_post_processing(
            job_dao=job_dao, result_dao=result_dao, report_dao=report_dao,
            job_id="j1",
        )

        # No metrics to store
        report_dao.update_aggregated_metrics.assert_not_called()
        # Status transition handled by caller
        job_dao.update_status.assert_not_called()

    @patch("evaluator_api.mlflow_client.terminate_run")
    @patch("evaluator_api.mlflow_client.log_artifact")
    @patch("evaluator_api.mlflow_client.log_metrics")
    @patch("evaluator_api.mlflow_client.find_run_by_name")
    @patch("evaluator_api.mlflow_client.get_or_create_experiment")
    def test_streaming_does_not_call_fetch_all(
        self,
        mock_get_exp: MagicMock,
        mock_find_run: MagicMock,
        mock_log_metrics: MagicMock,
        mock_log_artifact: MagicMock,
        mock_terminate: MagicMock,
    ) -> None:
        """Post-processing streams results — never loads all into memory."""
        mock_experiment = MagicMock()
        mock_experiment.experiment_id = "exp-123"
        mock_get_exp.return_value = mock_experiment
        mock_find_run.return_value = "run-456"

        job = self._make_job(experiment_name="my-experiment")

        # 3 pages of results (simulates large dataset)
        page1 = [
            ResultItem(report_id="r1", result_id=f"p1-{i}", created_at="2024-01-01T00:00:00Z",
                       scores={"accuracy": ScoreItemModel(value=0.8 + i * 0.05)})
            for i in range(3)
        ]
        page2 = [
            ResultItem(report_id="r1", result_id=f"p2-{i}", created_at="2024-01-01T00:00:00Z",
                       scores={"accuracy": ScoreItemModel(value=0.7 + i * 0.1)})
            for i in range(3)
        ]

        job_dao = MagicMock()
        job_dao.get.return_value = job
        result_dao = MagicMock()
        result_dao.query_by_report.side_effect = [
            (page1, "token-1"),
            (page2, None),
        ]
        report_dao = MagicMock()

        run_post_processing(
            job_dao=job_dao, result_dao=result_dao, report_dao=report_dao,
            job_id="j1",
        )

        # Paginated: 2 calls to query_by_report (not fetch_all_results)
        assert result_dao.query_by_report.call_count == 2

        # Aggregation covers all 6 results
        metrics = report_dao.update_aggregated_metrics.call_args[0][1]
        assert metrics["accuracy"]["count"] == 6

        # Artifacts: 6 results × 2 files (JSON + HTML) = 12 log_artifact calls
        assert mock_log_artifact.call_count == 12

    @patch("evaluator_api.mlflow_client.terminate_run")
    @patch("evaluator_api.mlflow_client.log_artifact")
    @patch("evaluator_api.mlflow_client.log_metrics")
    @patch("evaluator_api.mlflow_client.find_run_by_name")
    @patch("evaluator_api.mlflow_client.get_or_create_experiment")
    def test_streaming_artifacts_logged_per_result(
        self,
        mock_get_exp: MagicMock,
        mock_find_run: MagicMock,
        mock_log_metrics: MagicMock,
        mock_log_artifact: MagicMock,
        mock_terminate: MagicMock,
    ) -> None:
        """Each result gets its own JSON + HTML artifact upload."""
        mock_experiment = MagicMock()
        mock_experiment.experiment_id = "exp-123"
        mock_get_exp.return_value = mock_experiment
        mock_find_run.return_value = "run-456"

        job = self._make_job(experiment_name="my-experiment")
        results = self._make_results()

        job_dao = MagicMock()
        job_dao.get.return_value = job
        result_dao = MagicMock()
        result_dao.query_by_report.return_value = (results, None)
        report_dao = MagicMock()

        run_post_processing(
            job_dao=job_dao, result_dao=result_dao, report_dao=report_dao,
            job_id="j1",
        )

        # Each artifact call should reference the result ID in the path
        artifact_calls = mock_log_artifact.call_args_list
        json_calls = [c for c in artifact_calls if "Json" in str(c)]
        html_calls = [c for c in artifact_calls if "HTML" in str(c)]
        assert len(json_calls) == 3
        assert len(html_calls) == 3

    def test_job_not_found_raises(self) -> None:
        job_dao = MagicMock()
        job_dao.get.return_value = None
        result_dao = MagicMock()
        report_dao = MagicMock()

        with pytest.raises(ValueError, match="Job 'j1' not found"):
            run_post_processing(
                job_dao=job_dao, result_dao=result_dao, report_dao=report_dao,
                job_id="j1",
            )


# _result_to_dict


class TestResultToDict:
    def test_basic_fields(self) -> None:
        result = ResultItem(
            report_id="r1", result_id="res1", created_at="2024-01-01T00:00:00Z",
            input={"question": "What is 2+2?"},
            output={"answer": "4"},
            expected={"answer": "4"},
        )
        d = _result_to_dict(result)
        assert d["result_id"] == "res1"
        assert d["input"] == {"question": "What is 2+2?"}
        assert d["output"] == {"answer": "4"}
        assert d["expected"] == {"answer": "4"}
        assert "scores" not in d
        assert "app_metrics" not in d

    def test_with_scores(self) -> None:
        result = ResultItem(
            report_id="r1", result_id="res1", created_at="2024-01-01T00:00:00Z",
            scores={
                "accuracy": ScoreItemModel(value=0.9, reason="exact match"),
                "fluency": ScoreItemModel(value=0.7),
            },
        )
        d = _result_to_dict(result)
        assert "accuracy" in d["scores"]
        assert d["scores"]["accuracy"]["value"] == 0.9
        assert d["scores"]["accuracy"]["reason"] == "exact match"
        assert d["scores"]["fluency"]["value"] == 0.7

    def test_with_app_metrics(self) -> None:
        result = ResultItem(
            report_id="r1", result_id="res1", created_at="2024-01-01T00:00:00Z",
            app_metrics={"latency_ms": 123, "tokens": 50},
        )
        d = _result_to_dict(result)
        assert d["app_metrics"] == {"latency_ms": 123, "tokens": 50}

    def test_with_error(self) -> None:
        result = ResultItem(
            report_id="r1", result_id="res1", created_at="2024-01-01T00:00:00Z",
            error="timeout after 30s",
        )
        d = _result_to_dict(result)
        assert d["error"] == "timeout after 30s"

    def test_decimal_conversion(self) -> None:
        result = ResultItem(
            report_id="r1", result_id="res1", created_at="2024-01-01T00:00:00Z",
            app_metrics={"latency": Decimal("1.23")},
        )
        d = _result_to_dict(result)
        assert d["app_metrics"]["latency"] == 1.23
        assert isinstance(d["app_metrics"]["latency"], float)

    def test_with_metadata(self) -> None:
        result = ResultItem(
            report_id="r1", result_id="res1", created_at="2024-01-01T00:00:00Z",
            metadata={"source": "math-dataset", "difficulty": "easy"},
        )
        d = _result_to_dict(result)
        assert d["metadata"] == {"source": "math-dataset", "difficulty": "easy"}

    def test_with_testcase_id(self) -> None:
        result = ResultItem(
            report_id="r1", result_id="res1", created_at="2024-01-01T00:00:00Z",
            testcase_id="tc-001",
        )
        d = _result_to_dict(result)
        assert d["testcase_id"] == "tc-001"

    def test_omits_none_fields(self) -> None:
        result = ResultItem(
            report_id="r1", result_id="res1", created_at="2024-01-01T00:00:00Z",
        )
        d = _result_to_dict(result)
        assert d == {"result_id": "res1"}


# _result_to_html


class TestResultToHtml:
    def test_contains_result_id(self) -> None:
        d = {"result_id": "res1", "input": {"q": "hello"}}
        html = _result_to_html(d)
        assert "res1" in html
        assert "<th>input</th>" in html

    def test_scores_rendered(self) -> None:
        d = {
            "result_id": "res1",
            "scores": {"accuracy": {"value": 0.9, "reason": "exact match"}},
        }
        html = _result_to_html(d)
        assert "accuracy" in html
        assert "0.9" in html
        assert "exact match" in html

    def test_html_escapes_values(self) -> None:
        d = {"result_id": "res1", "input": {"q": "<script>alert('xss')</script>"}}
        html = _result_to_html(d)
        assert "<script>" not in html
        assert "&lt;script&gt;" in html


# log_result_artifacts


class TestLogResultArtifacts:
    @patch("evaluator_api.mlflow_client.log_artifact")
    def test_logs_json_and_html_per_result(self, mock_log_artifact: MagicMock) -> None:
        results = [
            ResultItem(
                report_id="r1", result_id="res1", created_at="2024-01-01T00:00:00Z",
                input={"q": "q1"}, output={"a": "a1"},
                scores={"accuracy": ScoreItemModel(value=0.9)},
                app_metrics={"latency": 100},
            ),
            ResultItem(
                report_id="r1", result_id="res2", created_at="2024-01-01T00:00:00Z",
                input={"q": "q2"}, output={"a": "a2"},
            ),
        ]
        count = log_result_artifacts("run-123", results)

        assert count == 2
        # 2 results × 2 artifacts (JSON + HTML) = 4 calls
        assert mock_log_artifact.call_count == 4

        # Check artifact paths
        artifact_paths = [c[0][2] for c in mock_log_artifact.call_args_list]
        assert artifact_paths.count("Test Case Results Json") == 2
        assert artifact_paths.count("Test Case Results HTML") == 2

    @patch("evaluator_api.mlflow_client.log_artifact")
    def test_json_content_is_valid(self, mock_log_artifact: MagicMock) -> None:
        """Verify the JSON artifact file content is valid and contains expected fields."""
        results = [
            ResultItem(
                report_id="r1", result_id="res1", created_at="2024-01-01T00:00:00Z",
                input={"q": "hello"}, output={"a": "world"},
                scores={"accuracy": ScoreItemModel(value=0.95, reason="good")},
                app_metrics={"latency_ms": 42},
            ),
        ]

        written_json: list[dict] = []

        def capture_artifact(run_id: str, local_path: str, artifact_path: str) -> None:
            if local_path.endswith(".json"):
                with open(local_path) as f:
                    written_json.append(json.load(f))

        mock_log_artifact.side_effect = capture_artifact

        log_result_artifacts("run-123", results)

        assert len(written_json) == 1
        data = written_json[0]
        assert data["result_id"] == "res1"
        assert data["input"] == {"q": "hello"}
        assert data["scores"]["accuracy"]["value"] == 0.95
        assert data["scores"]["accuracy"]["reason"] == "good"
        assert data["app_metrics"]["latency_ms"] == 42

    @patch("evaluator_api.mlflow_client.log_artifact")
    def test_empty_results_logs_nothing(self, mock_log_artifact: MagicMock) -> None:
        count = log_result_artifacts("run-123", [])

        assert count == 0
        mock_log_artifact.assert_not_called()
