"""Tests for report operations (create, get, list, delete)."""

import logging

import pytest
from awssolutions_gen_ai_evaluation_toolkit_python_client.api import DefaultApi
from awssolutions_gen_ai_evaluation_toolkit_python_client.exceptions import (
    ApiException,
    NotFoundException,
)
from awssolutions_gen_ai_evaluation_toolkit_python_client.models import (
    BatchCreateResultsRequestContent,
    BatchResultInput,
    BatchScoreItem,
    BatchUpdateScoresRequestContent,
    CreateReportRequestContent,
    CreateReportResponseContent,
    GetReportResponseContent,
    ScoreInput,
)

from tests.conftest import LogCapture


class TestCreateReport:
    def test_creates_report(self, client: DefaultApi) -> None:
        resp = client.create_report(
            CreateReportRequestContent(name="my-report", description="Test report"),
        )
        assert isinstance(resp, CreateReportResponseContent)
        assert resp.report.name == "my-report"
        assert resp.report.description == "Test report"
        assert resp.report.status == "ACTIVE"
        assert resp.report.report_id is not None

    def test_creates_report_minimal(self, client: DefaultApi) -> None:
        resp = client.create_report(CreateReportRequestContent(name="minimal-report"))
        assert resp.report.status == "ACTIVE"
        assert resp.report.name == "minimal-report"

    def test_creates_report_with_metadata(self, client: DefaultApi) -> None:
        resp = client.create_report(
            CreateReportRequestContent(name="report-with-meta", metadata={"env": "test", "version": "1.0"}),
        )
        assert resp.report.metadata == {"env": "test", "version": "1.0"}


class TestGetReport:
    def test_success(self, client: DefaultApi, report: CreateReportResponseContent) -> None:
        resp = client.get_report(report.report.report_id)
        assert isinstance(resp, GetReportResponseContent)
        assert resp.report.report_id == report.report.report_id
        assert resp.report.name == "test-report"

    def test_not_found(self, client: DefaultApi) -> None:
        with pytest.raises(NotFoundException):
            client.get_report("nonexistent")

    def test_request_context_logged(
        self, client: DefaultApi, report: CreateReportResponseContent, is_e2e: bool, log_capture: LogCapture,
    ) -> None:
        """Verify request context for GET /v2/reports/{reportId}."""
        client.get_report(report.report.report_id)

        if is_e2e:
            return

        log_capture.stop()
        entry = log_capture.find("API ")
        assert entry, "Missing Route start JSON log"
        assert entry["http_method"] == "GET"
        assert report.report.report_id in entry["path"]
        assert entry["path_parameters"]["report_id"] == report.report.report_id
        assert entry["resource"] == "/v2/reports/{reportId}"


class TestListReports:
    def test_multiple_reports(self, client: DefaultApi, cleanup: list[str]) -> None:
        created_ids = []
        for name in ["report-1", "report-2", "report-3"]:
            r = client.create_report(CreateReportRequestContent(name=name))
            created_ids.append(r.report.report_id)
            cleanup.append(r.report.report_id)

        resp = client.list_reports()
        listed_ids = {r.report_id for r in resp.reports}
        for cid in created_ids:
            assert cid in listed_ids

    def test_pagination(self, client: DefaultApi, cleanup: list[str]) -> None:
        for i in range(5):
            r = client.create_report(CreateReportRequestContent(name=f"report-{i}"))
            cleanup.append(r.report.report_id)

        resp1 = client.list_reports(max_results=2)
        assert len(resp1.reports) == 2
        assert resp1.next_token is not None

        resp2 = client.list_reports(max_results=2, next_token=resp1.next_token)
        assert len(resp2.reports) >= 1  # at least one more page of results

    def test_report_fields(self, client: DefaultApi, cleanup: list[str]) -> None:
        created = client.create_report(
            CreateReportRequestContent(name="detailed-report", description="A description", metadata={"k": "v"}),
        )
        cleanup.append(created.report.report_id)
        resp = client.get_report(created.report.report_id)
        report = resp.report
        assert report.name == "detailed-report"
        assert report.description == "A description"
        assert report.metadata == {"k": "v"}
        assert report.status == "ACTIVE"
        assert report.report_id is not None


class TestDeleteReport:
    def test_deletes_report(self, client: DefaultApi, report: CreateReportResponseContent) -> None:
        client.delete_report(report.report.report_id)
        with pytest.raises(NotFoundException):
            client.get_report(report.report.report_id)

    def test_idempotent_on_nonexistent(self, client: DefaultApi) -> None:
        """Deleting a nonexistent report should succeed (idempotent)."""
        client.delete_report("nonexistent-report-id")

    def test_cascade_deletes_results(self, client: DefaultApi, report: CreateReportResponseContent) -> None:
        client.batch_create_results(
            report.report.report_id,
            BatchCreateResultsRequestContent(results=[
                BatchResultInput(input={"q": "1"}),
                BatchResultInput(input={"q": "2"}),
                BatchResultInput(input={"q": "3"}),
            ]),
        )
        client.delete_report(report.report.report_id)

        # Report should be gone
        with pytest.raises(NotFoundException):
            client.get_report(report.report.report_id)

    def test_cascade_with_many_results(self, client: DefaultApi, cleanup: list[str]) -> None:
        """Verify cascade works with >25 results (batch_writer chunk boundary)."""
        resp = client.create_report(CreateReportRequestContent(name="big-report"))
        report_id = resp.report.report_id
        cleanup.append(report_id)

        # Split into two batches (API max is 25 per call)
        for start in (0, 25):
            client.batch_create_results(
                report_id,
                BatchCreateResultsRequestContent(
                    results=[BatchResultInput(input={"q": f"q{i}"}) for i in range(start, min(start + 25, 30))],
                ),
            )

        client.delete_report(report_id)

        with pytest.raises(NotFoundException):
            client.get_report(report_id)


@pytest.mark.onebox_only
class TestDeleteReportStatus:
    """Test DELETING status behavior during cascade delete."""

    def test_writes_rejected_during_delete(
        self, client: DefaultApi, report: CreateReportResponseContent,
    ) -> None:
        """batch_create_results rejects writes to a DELETING report."""
        report_id = report.report.report_id

        # Mark report as DELETING directly via DAO
        from evaluator_api.ddb import ReportStatus
        from evaluator_api.routes import get_report_dao

        report_dao = get_report_dao()
        report_dao.update_status(report_id, ReportStatus.DELETING)

        with pytest.raises(ApiException) as exc_info:
            client.batch_create_results(
                report_id,
                BatchCreateResultsRequestContent(
                    results=[BatchResultInput(input={"q": "1"})],
                ),
            )
        assert exc_info.value.status == 400

    def test_scores_rejected_during_delete(
        self, client: DefaultApi, report: CreateReportResponseContent,
    ) -> None:
        """batch_update_scores rejects writes to a DELETING report."""
        report_id = report.report.report_id

        # Create a result first, then mark report as DELETING
        create_resp = client.batch_create_results(
            report_id,
            BatchCreateResultsRequestContent(
                results=[BatchResultInput(input={"q": "1"})],
            ),
        )
        result_id = create_resp.results[0].result_id

        from evaluator_api.ddb import ReportStatus
        from evaluator_api.routes import get_report_dao

        report_dao = get_report_dao()
        report_dao.update_status(report_id, ReportStatus.DELETING)

        with pytest.raises(ApiException) as exc_info:
            client.batch_update_scores(
                report_id,
                BatchUpdateScoresRequestContent(
                    items=[BatchScoreItem(resultId=result_id, scores={"s": ScoreInput(value=1.0)})],
                ),
            )
        assert exc_info.value.status == 400

    def test_success_when_all_results_deleted(
        self, client: DefaultApi, report: CreateReportResponseContent,
    ) -> None:
        """When all results are successfully deleted, report is also deleted (200)."""
        report_id = report.report.report_id

        client.batch_create_results(
            report_id,
            BatchCreateResultsRequestContent(results=[
                BatchResultInput(input={"q": "1"}),
            ]),
        )

        client.delete_report(report_id)

        with pytest.raises(NotFoundException):
            client.get_report(report_id)


@pytest.mark.onebox_only
class TestLogVerbosity:
    """Ensure request logs follow the expected pattern and don't leak verbose data."""

    def test_get_report_log_pattern(
        self, client: DefaultApi, report: CreateReportResponseContent, log_capture: LogCapture,
    ) -> None:
        """A single GET request should produce exactly:
          - INFO:  Route start, Route completed (with status_code)
          - DEBUG: DAO and DynamoDB operation logs
          - No headers, CloudFront metadata, or full Lambda event at any level.
        """
        from evaluator_api.ddb.common import logger as dao_logger
        from evaluator_api.routes import logger as pw_logger

        # Capture at DEBUG so we can verify level assignments
        original_levels = pw_logger.log_level, dao_logger.log_level
        pw_logger.setLevel(logging.DEBUG)
        dao_logger.setLevel(logging.DEBUG)
        try:
            client.get_report(report.report.report_id)
        finally:
            pw_logger.setLevel(original_levels[0])
            dao_logger.setLevel(original_levels[1])

        log_capture.stop()
        entries = log_capture.entries

        # --- INFO: only route start/completed ---
        info_messages = [e["message"] for e in entries if e.get("level") == "INFO"]
        assert len(info_messages) == 2, f"Expected 2 INFO messages, got: {info_messages}"
        assert all(m.startswith("API ") for m in info_messages), f"Expected API messages, got: {info_messages}"
        completed = next(e for e in entries if e.get("message", "").startswith("API ") and "→" in e.get("message", ""))
        assert "200" in completed["message"]

        # --- DEBUG: DAO and DynamoDB logs exist here, not at INFO ---
        debug_messages = [e["message"] for e in entries if e.get("level") == "DEBUG"]
        assert any("ReportDao" in m for m in debug_messages), (
            f"DAO logs missing from DEBUG, got: {debug_messages}"
        )
        assert any("DynamoDB" in m for m in debug_messages), (
            f"DynamoDB logs missing from DEBUG, got: {debug_messages}"
        )

        # --- No headers or event dumps at any level ---
        for entry in entries:
            assert "headers" not in entry, f"Headers leaked into log: {entry['message']}"
            assert "multiValueHeaders" not in entry, f"Multi-value headers in log: {entry['message']}"
            assert "CloudFront" not in str(entry), f"CloudFront metadata in log: {entry['message']}"
