"""Test result routes for the Evaluator API."""

import re
from datetime import datetime, timezone

from botocore.exceptions import ClientError

from evaluator_api.ddb import ReportStatus, ResultItem, ScoreItemModel
from evaluator_api.routes import (
    ResourceNotFoundException,
    ValidationException,
    app,
    generate_id,
    get_report_dao,
    get_result_dao,
    item_to_test_result,
    logger,
)
from evaluator_api.routes.models import (
    BatchCreateResultsRequestContent,
    BatchCreateResultsResponseContent,
    BatchDeleteResultsRequestContent,
    BatchDeleteResultsResponseContent,
    BatchItemError,
    BatchResultOutput,
    BatchUpdateScoresRequestContent,
    BatchUpdateScoresResponseContent,
    GetTestResultResponseContent,
    ListTestResultsResponseContent,
)

# Score names: alphanumeric, underscores, and dots (as sub-score separator).
# e.g. "exact_match", "quality.length", "quality.prefix"
# Dots may not be leading, trailing, or consecutive.
# Constraint is defined in Smithy (ScorerName type with @pattern) but the OpenAPI Python
# generator does not enforce @pattern on map keys, only on direct model properties.
# This manual check is required until the generator supports map key validation.
_SCORE_NAME_RE = re.compile(r"^[a-zA-Z0-9_]+(\.[a-zA-Z0-9_]+)*$")


@app.get("/v2/reports/<report_id>/results/<result_id>")
def get_test_result(report_id: str, result_id: str) -> GetTestResultResponseContent:
    """Get a test result by ID."""
    result_dao = get_result_dao()

    item = result_dao.get(report_id, result_id)
    if not item:
        raise ResourceNotFoundException(f"Result '{result_id}' not found")

    result = item_to_test_result(item)

    return GetTestResultResponseContent(result=result)


@app.get("/v2/reports/<report_id>/results")
def list_test_results(report_id: str) -> ListTestResultsResponseContent:
    """List test results for a report (paginated)."""
    result_dao = get_result_dao()

    # Get pagination params from query string
    query_params = app.current_event.query_string_parameters or {}
    max_results_str = query_params.get("maxResults")
    try:
        max_results = int(max_results_str) if max_results_str else None
    except ValueError:
        raise ValidationException(f"maxResults must be an integer, got '{max_results_str}'")  # noqa: B904
    next_token = query_params.get("nextToken")

    items, result_next_token = result_dao.query_by_report(
        report_id=report_id,
        max_results=max_results,
        next_token=next_token,
    )

    results = [item_to_test_result(item) for item in items]

    return ListTestResultsResponseContent(testResults=results, nextToken=result_next_token)


@app.post("/v2/reports/<report_id>/results/batch")
def batch_create_results(
    report_id: str, body: BatchCreateResultsRequestContent
) -> BatchCreateResultsResponseContent:
    """Create multiple test results in a batch."""
    result_dao = get_result_dao()
    report_dao = get_report_dao()

    report = report_dao.get(report_id)
    if not report:
        raise ResourceNotFoundException(f"Report '{report_id}' not found")
    if report.status == ReportStatus.DELETING:
        raise ValidationException(f"Report '{report_id}' is being deleted")

    now = datetime.now(timezone.utc)
    outputs: list[BatchResultOutput] = []
    errors: list[BatchItemError] = []

    for idx, result_input in enumerate(body.results):
        result_id = result_input.result_id or generate_id()

        item = ResultItem(
            report_id=report_id,
            result_id=result_id,
            created_at=now.isoformat(),
            scores={},
            input=result_input.input,
            output=result_input.output,
            expected=result_input.expected,
            context=result_input.context,
            testcase_id=result_input.testcase_id,
            app_metrics=result_input.app_metrics,
            error=result_input.error,
            metadata=result_input.metadata,
        )

        try:
            result_dao.put(item)
            outputs.append(BatchResultOutput(resultId=result_id, testcaseId=result_input.testcase_id, index=idx))
        except ClientError as e:
            logger.warning("BatchCreateResults item failed", extra={"index": idx, "error": str(e)})
            errors.append(BatchItemError(id=str(idx), code="CREATE_FAILED", message=str(e), index=idx))

    return BatchCreateResultsResponseContent(results=outputs, errors=errors, count=len(outputs))


@app.post("/v2/reports/<report_id>/results/scores/batch")
def batch_update_scores(
    report_id: str, body: BatchUpdateScoresRequestContent
) -> BatchUpdateScoresResponseContent:
    """Add scores to multiple results in a batch."""
    result_dao = get_result_dao()
    report_dao = get_report_dao()

    report = report_dao.get(report_id)
    if not report:
        raise ResourceNotFoundException(f"Report '{report_id}' not found")
    if report.status == ReportStatus.DELETING:
        raise ValidationException(f"Report '{report_id}' is being deleted")

    updated_count = 0
    errors: list[BatchItemError] = []
    now = datetime.now(timezone.utc)

    # Validate all score names upfront
    for score_item in body.items:
        for name in score_item.scores:
            if not _SCORE_NAME_RE.match(name):
                raise ValidationException(
                    f"Invalid score name '{name}'. "
                    f"Score names must match [a-zA-Z0-9_]+(\\.[a-zA-Z0-9_]+)*"
                )

    for score_item in body.items:
        scores: dict[str, ScoreItemModel] = {}
        for name, score in score_item.scores.items():
            scores[name] = ScoreItemModel(
                value=score.value,
                reason=score.reason,
                error=score.error,
                context=score.context,
                scoredAt=now.isoformat(),
            )

        try:
            result_dao.update(
                report_id=report_id,
                result_id=score_item.result_id,
                scores=scores,
            )
            updated_count += 1
        except ClientError as e:
            code = e.response.get("Error", {}).get("Code", "")
            if code == "ConditionalCheckFailedException":
                errors.append(BatchItemError(
                    id=score_item.result_id, code="NOT_FOUND",
                    message=f"Result '{score_item.result_id}' not found",
                ))
            else:
                logger.warning(
                    "BatchUpdateScores item failed",
                    extra={"result_id": score_item.result_id, "error": str(e)},
                )
                errors.append(BatchItemError(
                    id=score_item.result_id, code="UPDATE_FAILED", message=str(e),
                ))

    return BatchUpdateScoresResponseContent(updatedCount=updated_count, errors=errors)


@app.post("/v2/reports/<report_id>/results/delete/batch")
def batch_delete_results(
    report_id: str, body: BatchDeleteResultsRequestContent
) -> BatchDeleteResultsResponseContent:
    """Delete multiple test results by ID."""
    result_dao = get_result_dao()
    report_dao = get_report_dao()

    if not report_dao.exists(report_id):
        raise ResourceNotFoundException(f"Report '{report_id}' not found")

    deleted_count = 0
    errors: list[BatchItemError] = []

    for result_id in body.result_ids:
        try:
            result_dao.delete(report_id, result_id)
            deleted_count += 1
        except ClientError as e:
            logger.warning(
                "BatchDeleteResults item failed",
                extra={"result_id": result_id, "error": str(e)},
            )
            errors.append(BatchItemError(
                id=result_id, code="DELETE_FAILED", message=str(e),
            ))

    return BatchDeleteResultsResponseContent(deletedCount=deleted_count, errors=errors)
