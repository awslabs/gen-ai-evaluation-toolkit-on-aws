"""Report routes for the Evaluator API."""

from datetime import datetime, timezone

from aws_lambda_powertools.event_handler import Response, content_types
from botocore.exceptions import ClientError

from evaluator_api.ddb import ReportItem
from evaluator_api.ddb import ReportStatus as DDBReportStatus
from evaluator_api.routes import (
    ResourceNotFoundException,
    ValidationException,
    app,
    generate_id,
    get_report_dao,
    get_result_dao,
    logger,
)
from evaluator_api.routes.models import (
    CreateReportRequestContent,
    CreateReportResponseContent,
    GetReportResponseContent,
    ListReportsResponseContent,
    Report,
    ReportStatus,
)


def _item_to_report(item: ReportItem) -> Report:
    """Convert a DynamoDB ReportItem to an API Report."""
    return Report(
        reportId=item.report_id,
        status=ReportStatus(item.status),
        name=item.name or "",
        description=item.description,
        experimentName=item.experiment_name,
        metadata=item.metadata,
        jobIds=item.job_ids or None,
        createdAt=datetime.fromisoformat(item.created_at),
        updatedAt=datetime.fromisoformat(item.updated_at) if item.updated_at else None,
    )


@app.get("/v2/reports")
def list_reports() -> ListReportsResponseContent:
    """List all reports (paginated)."""
    report_dao = get_report_dao()

    query_params = app.current_event.query_string_parameters or {}
    max_results_str = query_params.get("maxResults")
    try:
        max_results = int(max_results_str) if max_results_str else None
    except ValueError:
        raise ValidationException(f"maxResults must be an integer, got '{max_results_str}'")  # noqa: B904
    next_token = query_params.get("nextToken")

    items, result_next_token = report_dao.list_all(
        max_results=max_results,
        next_token=next_token,
    )

    reports = [_item_to_report(item) for item in items]

    return ListReportsResponseContent(reports=reports, nextToken=result_next_token)


@app.post("/v2/reports")
def create_report(body: CreateReportRequestContent) -> CreateReportResponseContent:
    """Create a new report."""
    report_dao = get_report_dao()

    report_id = generate_id()
    now = datetime.now(timezone.utc)

    item = ReportItem(
        report_id=report_id,
        created_at=now.isoformat(),
        status=DDBReportStatus.ACTIVE,
        name=body.name,
        description=body.description,
        experiment_name=body.experiment_name,
        metadata=body.metadata,
    )

    report_dao.put(item)

    report = Report(
        reportId=report_id,
        status=ReportStatus.ACTIVE,
        name=body.name or "",
        description=body.description,
        experimentName=body.experiment_name,
        metadata=body.metadata,
        createdAt=now,
    )

    return CreateReportResponseContent(report=report)


@app.get("/v2/reports/<report_id>")
def get_report(report_id: str) -> GetReportResponseContent:
    """Get a report by ID."""
    report_dao = get_report_dao()

    item = report_dao.get(report_id)
    if not item:
        raise ResourceNotFoundException(f"Report '{report_id}' not found")

    return GetReportResponseContent(report=_item_to_report(item))


class ConflictException(Exception):
    def __init__(self, message: str) -> None:
        self.message = message
        super().__init__(message)


@app.exception_handler(ConflictException)  # type: ignore[untyped-decorator]
def handle_conflict(ex: ConflictException) -> Response:  # type: ignore[type-arg]
    logger.warning("Conflict", extra={"error_message": ex.message})
    return Response(
        status_code=409,
        content_type=content_types.APPLICATION_JSON,
        body={"message": ex.message, "__type": "ConflictException"},
    )


@app.delete("/v2/reports/<report_id>")
def delete_report(report_id: str) -> dict[str, str]:
    """Delete a report and all its results. Idempotent — succeeds even if not found."""
    report_dao = get_report_dao()
    result_dao = get_result_dao()

    # Mark report as DELETING to signal writers to stop
    try:
        report_dao.update_status(report_id, DDBReportStatus.DELETING)
    except ClientError as e:
        if e.response.get("Error", {}).get("Code") == "ConditionalCheckFailedException":
            pass  # Report doesn't exist — still delete any orphaned results
        else:
            raise

    # Cascade: delete all results
    result_dao.delete_all_by_report(report_id)

    # Delete the report itself
    report_dao.delete(report_id)

    return {}
