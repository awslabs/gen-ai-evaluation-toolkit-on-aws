"""Tests for job operations (submit, get, update, list)."""

import logging

import pytest
from awssolutions_gen_ai_evaluation_toolkit_python_client.api import DefaultApi
from awssolutions_gen_ai_evaluation_toolkit_python_client.exceptions import (
    ApiException,
    BadRequestException,
    NotFoundException,
)
from awssolutions_gen_ai_evaluation_toolkit_python_client.models import (
    BatchCreateResultsRequestContent,
    BatchResultInput,
    BatchScoreItem,
    BatchUpdateScoresRequestContent,
    CreateReportRequestContent,
    GetEvaluatorJobResponseContent,
    JobError,
    JobStage,
    JobStatus,
    ScoreInput,
    ScorerConfig,
    SubmitAppInvocationJobRequestContent,
    SubmitAppInvocationJobResponseContent,
    SubmitEvaluationJobRequestContent,
    SubmitEvaluationJobResponseContent,
    SubmitScoringJobRequestContent,
    SubmitScoringJobResponseContent,
    TaskStatus,
    TestDataSource,
    UpdateEvaluatorJobStatusRequestContent,
    UpdateEvaluatorJobStatusResponseContent,
)


class TestGetJob:
    def test_success(self, client: DefaultApi, job: SubmitEvaluationJobResponseContent) -> None:
        resp = client.get_evaluator_job(job.job_id)
        assert isinstance(resp, GetEvaluatorJobResponseContent)
        assert resp.job_id == job.job_id
        assert resp.evaluator_name == "my-eval"
        assert resp.job_type.value == "FULL"
        assert resp.status == JobStatus.PENDING
        assert resp.report_id == job.report_id
        assert resp.created_at is not None

    def test_get_returns_scorers(self, client: DefaultApi) -> None:
        submit_resp = client.submit_evaluation_job(
            "my-eval",
            SubmitEvaluationJobRequestContent(
                testCases=TestDataSource.from_dict({"dataset": {"datasetId": "ds-1"}}),
                scorers={
                    "exact_match": ScorerConfig(),
                    "ragas": ScorerConfig(params={"model_id": "nova"}, scores={"faithfulness": None}),
                },
            ),
        )
        resp = client.get_evaluator_job(submit_resp.job_id)
        assert resp.scorers is not None
        assert "exact_match" in resp.scorers
        assert resp.scorers["ragas"].params == {"model_id": "nova"}

    def test_get_returns_error_details(self, client: DefaultApi, job: SubmitEvaluationJobResponseContent) -> None:
        """Error code, message, and stackTrace survive round-trip."""
        client.update_evaluator_job_status(
            job.job_id,
            UpdateEvaluatorJobStatusRequestContent(
                status=TaskStatus.FAILED,
                error=JobError(
                    code="SCORER_TIMEOUT",
                    message="Scorer exceeded 30s limit",
                    stackTrace="Traceback:\n  File scorer.py, line 42",
                ),
            ),
        )
        resp = client.get_evaluator_job(job.job_id)
        assert resp.status == JobStatus.FAILURE
        assert resp.error is not None
        assert resp.error.code == "SCORER_TIMEOUT"
        assert resp.error.message == "Scorer exceeded 30s limit"
        assert resp.error.stack_trace == "Traceback:\n  File scorer.py, line 42"

    def test_not_found(self, client: DefaultApi, is_e2e: bool, caplog: pytest.LogCaptureFixture) -> None:
        with caplog.at_level(logging.INFO):
            with pytest.raises(NotFoundException):
                client.get_evaluator_job("nonexistent")

        if not is_e2e:
            messages = [r.message for r in caplog.records]
            assert any("API " in m for m in messages), "Missing route entry log"
            # Exception handler logs a warning
            warnings = [r for r in caplog.records if r.levelno == logging.WARNING]
            assert any("Resource not found" in r.message for r in warnings), "Missing not-found warning"


class TestUpdateStatus:
    def test_to_running(self, client: DefaultApi, job: SubmitEvaluationJobResponseContent) -> None:
        resp = client.update_evaluator_job_status(
            job.job_id,
            UpdateEvaluatorJobStatusRequestContent(status=TaskStatus.RUNNING),
        )
        assert isinstance(resp, UpdateEvaluatorJobStatusResponseContent)
        assert resp.status == TaskStatus.RUNNING

    def test_to_completed(self, client: DefaultApi, job: SubmitEvaluationJobResponseContent) -> None:
        resp = client.update_evaluator_job_status(
            job.job_id,
            UpdateEvaluatorJobStatusRequestContent(status=TaskStatus.COMPLETED),
        )
        assert resp.status == TaskStatus.COMPLETED

    def test_to_failed(self, client: DefaultApi, job: SubmitEvaluationJobResponseContent) -> None:
        resp = client.update_evaluator_job_status(
            job.job_id,
            UpdateEvaluatorJobStatusRequestContent(
                status=TaskStatus.FAILED,
                error=JobError(code="ERR", message="oops"),
            ),
        )
        assert resp.status == TaskStatus.FAILED

    def test_stage_and_result_persisted(self, client: DefaultApi, job: SubmitEvaluationJobResponseContent) -> None:
        """stage and result fields are stored and visible via GET."""
        client.update_evaluator_job_status(
            job.job_id,
            UpdateEvaluatorJobStatusRequestContent(
                status=TaskStatus.RUNNING,
                stage=JobStage.INVOKING,
                result={"summary": "3/10 testcases processed"},
            ),
        )
        get_resp = client.get_evaluator_job(job.job_id)
        assert get_resp.status == JobStatus.RUNNING
        assert get_resp.stage == JobStage.INVOKING
        assert get_resp.result["summary"] == "3/10 testcases processed"
        assert get_resp.updated_at is not None

    def test_not_found(self, client: DefaultApi) -> None:
        with pytest.raises(NotFoundException):
            client.update_evaluator_job_status(
                "nonexistent",
                UpdateEvaluatorJobStatusRequestContent(status=TaskStatus.RUNNING),
            )


class TestSubmitEvaluation:
    """Tests for POST /v2/evaluators/{name}/jobs/evaluate."""

    def test_full_with_dataset(self, client: DefaultApi) -> None:
        resp = client.submit_evaluation_job(
            "my-eval",
            SubmitEvaluationJobRequestContent(
                testCases=TestDataSource.from_dict({"dataset": {"datasetId": "ds-1"}}),
            ),
        )
        assert isinstance(resp, SubmitEvaluationJobResponseContent)
        assert resp.job_id is not None
        assert resp.report_id is not None
        assert resp.status == JobStatus.PENDING
        assert resp.job_type.value == "FULL"
        assert resp.evaluator_name == "my-eval"

    def test_full_with_report_id(self, client: DefaultApi) -> None:
        report_resp = client.create_report(CreateReportRequestContent(name="pre-created"))
        report_id = report_resp.report.report_id

        resp = client.submit_evaluation_job(
            "my-eval",
            SubmitEvaluationJobRequestContent(
                testCases=TestDataSource.from_dict({"dataset": {"datasetId": "ds-1"}}),
                reportId=report_id,
            ),
        )
        assert resp.report_id == report_id

    def test_full_with_scorers(self, client: DefaultApi) -> None:
        resp = client.submit_evaluation_job(
            "my-eval",
            SubmitEvaluationJobRequestContent(
                testCases=TestDataSource.from_dict({"dataset": {"datasetId": "ds-1"}}),
                scorers={
                    "exact_match": ScorerConfig(),
                    "ragas": ScorerConfig(params={"model_id": "nova"}, scores={"faithfulness": None}),
                },
            ),
        )
        assert resp.job.scorers is not None
        assert "exact_match" in resp.job.scorers
        assert resp.job.scorers["ragas"].params == {"model_id": "nova"}

    def test_scorers_with_null_value(self, client: DefaultApi) -> None:
        """Sparse map: None value means 'run scorer with defaults'."""
        resp = client.submit_evaluation_job(
            "my-eval",
            SubmitEvaluationJobRequestContent(
                testCases=TestDataSource.from_dict({"dataset": {"datasetId": "ds-1"}}),
                scorers={
                    "exact_match": None,
                    "ragas": ScorerConfig(params={"model_id": "nova"}),
                },
            ),
        )
        assert resp.job.scorers is not None
        assert "exact_match" in resp.job.scorers
        assert resp.job.scorers["exact_match"] is None
        assert resp.job.scorers["ragas"].params == {"model_id": "nova"}

    def test_requires_test_data(self, client: DefaultApi) -> None:
        """testCases is required — client-side Pydantic rejects missing body."""
        with pytest.raises((ApiException, Exception)):
            client.submit_evaluation_job("my-eval")

    def test_full_with_inline_test_data(self, client: DefaultApi) -> None:
        """Inline test cases are accepted and job is created."""
        resp = client.submit_evaluation_job(
            "my-eval",
            SubmitEvaluationJobRequestContent(
                testCases=TestDataSource.from_dict({"inline": [
                    {"input": {"q": "What is 2+2?"}, "expected": {"a": "4"}},
                    {"input": {"q": "What is 3+3?"}, "expected": {"a": "6"}},
                ]}),
            ),
        )
        assert isinstance(resp, SubmitEvaluationJobResponseContent)
        assert resp.job_id is not None
        assert resp.job_type.value == "FULL"

    def test_empty_inline_rejected(self, client: DefaultApi) -> None:
        """Empty inline test cases should be rejected."""
        with pytest.raises(BadRequestException):
            client.submit_evaluation_job(
                "my-eval",
                SubmitEvaluationJobRequestContent(
                    testCases=TestDataSource.from_dict({"inline": []}),
                ),
            )

    def test_get_job_after_evaluate(self, client: DefaultApi) -> None:
        submit_resp = client.submit_evaluation_job(
            "my-eval",
            SubmitEvaluationJobRequestContent(
                testCases=TestDataSource.from_dict({"dataset": {"datasetId": "ds-1"}}),
            ),
        )
        get_resp = client.get_evaluator_job(submit_resp.job_id)
        assert get_resp.job_id == submit_resp.job_id
        assert get_resp.job_type.value == "FULL"


class TestSubmitScoring:
    """Tests for POST /v2/evaluators/{name}/jobs/score."""

    def _create_source_report(self, client: DefaultApi) -> tuple[str, list[str]]:
        """Helper: create a report with 3 scored results."""
        report_resp = client.create_report(
            CreateReportRequestContent(name="source-report"),
        )
        report_id = report_resp.report.report_id
        batch_resp = client.batch_create_results(
            report_id,
            BatchCreateResultsRequestContent(results=[
                BatchResultInput(input={"q": "q1"}, expected={"a": "a1"}, output={"o": "o1"}),
                BatchResultInput(input={"q": "q2"}, expected={"a": "a2"}, output={"o": "o2"}),
                BatchResultInput(input={"q": "q3"}, expected={"a": "a3"}, output={"o": "o3"}),
            ]),
        )
        client.batch_update_scores(
            report_id,
            BatchUpdateScoresRequestContent(items=[
                BatchScoreItem(resultId=batch_resp.results[0].result_id, scores={"accuracy": ScoreInput(value=0.9)}),
            ]),
        )
        result_ids = [r.result_id for r in batch_resp.results]
        return report_id, result_ids

    def test_score_in_place(self, client: DefaultApi) -> None:
        report_resp = client.create_report(CreateReportRequestContent(name="existing"))
        report_id = report_resp.report.report_id
        client.batch_create_results(
            report_id,
            BatchCreateResultsRequestContent(results=[BatchResultInput(input={"q": "q1"})]),
        )

        resp = client.submit_scoring_job(
            "my-eval",
            SubmitScoringJobRequestContent(reportId=report_id),
        )
        assert isinstance(resp, SubmitScoringJobResponseContent)
        assert resp.report_id == report_id
        assert resp.source_report_id is None
        assert resp.job_type.value == "SCORE"

    def test_score_from_source(self, client: DefaultApi) -> None:
        source_id, _ = self._create_source_report(client)

        resp = client.submit_scoring_job(
            "my-eval",
            SubmitScoringJobRequestContent(sourceReportId=source_id),
        )
        assert resp.report_id != source_id  # new report created
        assert resp.source_report_id == source_id

        # New report has copied results with scores stripped
        new_results = client.list_test_results(resp.report_id)
        assert len(new_results.test_results) == 3
        for r in new_results.test_results:
            assert r.scores is None or len(r.scores) == 0

        # Source report is unchanged
        source_results = client.list_test_results(source_id)
        scored = [r for r in source_results.test_results if r.scores]
        assert len(scored) == 1

    def test_score_with_scorers(self, client: DefaultApi) -> None:
        report_resp = client.create_report(CreateReportRequestContent(name="to-score"))
        report_id = report_resp.report.report_id
        client.batch_create_results(
            report_id,
            BatchCreateResultsRequestContent(results=[BatchResultInput(input={"q": "q1"})]),
        )

        resp = client.submit_scoring_job(
            "my-eval",
            SubmitScoringJobRequestContent(
                reportId=report_id,
                scorers={"exact_match": ScorerConfig(), "ragas": ScorerConfig(params={"model_id": "nova"})},
            ),
        )
        assert resp.job.scorers is not None
        assert "exact_match" in resp.job.scorers

    def test_source_report_not_found(self, client: DefaultApi) -> None:
        with pytest.raises(NotFoundException):
            client.submit_scoring_job(
                "my-eval",
                SubmitScoringJobRequestContent(sourceReportId="nonexistent"),
            )

    def test_both_report_and_source_rejected(self, client: DefaultApi) -> None:
        with pytest.raises(BadRequestException):
            client.submit_scoring_job(
                "my-eval",
                SubmitScoringJobRequestContent(reportId="r1", sourceReportId="r2"),
            )

    def test_neither_report_nor_source_rejected(self, client: DefaultApi) -> None:
        with pytest.raises((BadRequestException, ApiException)):
            client.submit_scoring_job("my-eval", SubmitScoringJobRequestContent())

    def test_score_in_place_report_not_found(self, client: DefaultApi) -> None:
        """Score in place with nonexistent report should 404."""
        with pytest.raises(NotFoundException):
            client.submit_scoring_job(
                "my-eval",
                SubmitScoringJobRequestContent(reportId="nonexistent"),
            )

    def test_score_in_place_empty_report_rejected(self, client: DefaultApi) -> None:
        """Score in place with report that has no results should 400."""
        report_resp = client.create_report(CreateReportRequestContent(name="empty-report"))
        with pytest.raises(BadRequestException):
            client.submit_scoring_job(
                "my-eval",
                SubmitScoringJobRequestContent(reportId=report_resp.report.report_id),
            )

    def test_score_from_source_empty_report_rejected(self, client: DefaultApi) -> None:
        """Score from source where source has no results should 400."""
        report_resp = client.create_report(CreateReportRequestContent(name="empty-source"))
        with pytest.raises(BadRequestException):
            client.submit_scoring_job(
                "my-eval",
                SubmitScoringJobRequestContent(sourceReportId=report_resp.report.report_id),
            )

    def test_score_with_dataset_rejected(self, client: DefaultApi) -> None:
        """Scoring jobs with dataset references are rejected (no pre-supplied outputs)."""
        with pytest.raises(BadRequestException):
            client.submit_scoring_job(
                "my-eval",
                SubmitScoringJobRequestContent(
                    testCases=TestDataSource.from_dict({"dataset": {"datasetId": "ds-1"}}),
                ),
            )

    def test_get_job_shows_source_report_id(self, client: DefaultApi) -> None:
        source_id, _ = self._create_source_report(client)

        submit_resp = client.submit_scoring_job(
            "my-eval",
            SubmitScoringJobRequestContent(sourceReportId=source_id),
        )

        get_resp = client.get_evaluator_job(submit_resp.job_id)
        assert get_resp.source_report_id == source_id
        assert get_resp.job_type.value == "SCORE"


class TestSubmitAppInvocation:
    """Tests for POST /v2/evaluators/{name}/jobs/invoke."""

    def test_invoke_with_dataset(self, client: DefaultApi) -> None:
        resp = client.submit_app_invocation_job(
            "my-eval",
            SubmitAppInvocationJobRequestContent(
                testCases=TestDataSource.from_dict({"dataset": {"datasetId": "ds-1"}}),
            ),
        )
        assert isinstance(resp, SubmitAppInvocationJobResponseContent)
        assert resp.job_id is not None
        assert resp.report_id is not None
        assert resp.status == JobStatus.PENDING
        assert resp.job_type.value == "APP_INVOKE"
        assert resp.evaluator_name == "my-eval"
        assert resp.job.scorers is None

    def test_invoke_with_report_id(self, client: DefaultApi) -> None:
        report_resp = client.create_report(CreateReportRequestContent(name="invoke-report"))
        report_id = report_resp.report.report_id

        resp = client.submit_app_invocation_job(
            "my-eval",
            SubmitAppInvocationJobRequestContent(
                testCases=TestDataSource.from_dict({"dataset": {"datasetId": "ds-1"}}),
                reportId=report_id,
            ),
        )
        assert resp.report_id == report_id

    def test_requires_test_data(self, client: DefaultApi) -> None:
        """testCases is required — client-side Pydantic rejects missing body."""
        with pytest.raises((ApiException, Exception)):
            client.submit_app_invocation_job("my-eval")

    def test_invoke_with_inline_test_data(self, client: DefaultApi) -> None:
        """Inline test cases are accepted and job is created."""
        resp = client.submit_app_invocation_job(
            "my-eval",
            SubmitAppInvocationJobRequestContent(
                testCases=TestDataSource.from_dict({"inline": [
                    {"input": {"q": "What is 2+2?"}, "expected": {"a": "4"}},
                ]}),
            ),
        )
        assert isinstance(resp, SubmitAppInvocationJobResponseContent)
        assert resp.job_id is not None
        assert resp.job_type.value == "APP_INVOKE"

    def test_empty_inline_rejected(self, client: DefaultApi) -> None:
        """Empty inline test cases should be rejected."""
        with pytest.raises(BadRequestException):
            client.submit_app_invocation_job(
                "my-eval",
                SubmitAppInvocationJobRequestContent(
                    testCases=TestDataSource.from_dict({"inline": []}),
                ),
            )

    def test_get_job_after_invoke(self, client: DefaultApi) -> None:
        submit_resp = client.submit_app_invocation_job(
            "my-eval",
            SubmitAppInvocationJobRequestContent(
                testCases=TestDataSource.from_dict({"dataset": {"datasetId": "ds-1"}}),
            ),
        )
        get_resp = client.get_evaluator_job(submit_resp.job_id)
        assert get_resp.job_id == submit_resp.job_id
        assert get_resp.job_type.value == "APP_INVOKE"


class TestReportNameAndExperimentName:
    """Tests for reportName and experimentName on job submission."""

    def test_submit_auto_creates_report_with_name(self, client: DefaultApi) -> None:
        """Submit with reportName — verify report is auto-created with that name."""
        resp = client.submit_evaluation_job(
            "my-eval",
            SubmitEvaluationJobRequestContent(
                testCases=TestDataSource.from_dict({"dataset": {"datasetId": "ds-1"}}),
                reportName="My Custom Report",
            ),
        )
        report_resp = client.get_report(resp.report_id)
        assert report_resp.report.name == "My Custom Report"

    def test_submit_auto_creates_report_default_name(self, client: DefaultApi) -> None:
        """Submit without reportName — verify report is auto-created with default name."""
        resp = client.submit_evaluation_job(
            "my-eval",
            SubmitEvaluationJobRequestContent(
                testCases=TestDataSource.from_dict({"dataset": {"datasetId": "ds-1"}}),
            ),
        )
        report_resp = client.get_report(resp.report_id)
        assert report_resp.report.name == "my-eval - FULL"

    def test_submit_with_experiment_name(self, client: DefaultApi) -> None:
        """experimentName round-trips on job GET and on auto-created report."""
        resp = client.submit_evaluation_job(
            "my-eval",
            SubmitEvaluationJobRequestContent(
                testCases=TestDataSource.from_dict({"dataset": {"datasetId": "ds-1"}}),
                experimentName="exp-alpha",
            ),
        )
        # Verify on submit response
        assert resp.experiment_name == "exp-alpha"

        # Verify on job GET
        job_resp = client.get_evaluator_job(resp.job_id)
        assert job_resp.experiment_name == "exp-alpha"

        # Verify on auto-created report
        report_resp = client.get_report(resp.report_id)
        assert report_resp.report.experiment_name == "exp-alpha"

    def test_submit_with_report_id_ignores_report_name(self, client: DefaultApi) -> None:
        """When reportId is provided, no new report is created — reportName is ignored."""
        # Create a report first
        create_resp = client.create_report(
            CreateReportRequestContent(name="pre-existing"),
        )
        report_id = create_resp.report.report_id

        resp = client.submit_evaluation_job(
            "my-eval",
            SubmitEvaluationJobRequestContent(
                testCases=TestDataSource.from_dict({"dataset": {"datasetId": "ds-1"}}),
                reportId=report_id,
                reportName="Should Be Ignored",
            ),
        )
        assert resp.report_id == report_id

        # Report name should still be the original
        report_resp = client.get_report(report_id)
        assert report_resp.report.name == "pre-existing"

    def test_create_report_with_experiment_name(self, client: DefaultApi) -> None:
        """Standalone report creation with experimentName."""
        resp = client.create_report(
            CreateReportRequestContent(
                name="experiment report",
                experimentName="exp-beta",
            ),
        )
        assert resp.report.experiment_name == "exp-beta"

        # Verify via GET
        get_resp = client.get_report(resp.report.report_id)
        assert get_resp.report.experiment_name == "exp-beta"
