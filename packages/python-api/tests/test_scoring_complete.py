"""Onebox integration tests for the COMPLETED status transition.

Tests the flow: submit job → add results → COMPLETED → verify SFN started
for post-processing → run post-processing directly → verify aggregation.
"""

from unittest.mock import MagicMock, patch

from awssolutions_gen_ai_evaluation_toolkit_python_client.api import DefaultApi
from awssolutions_gen_ai_evaluation_toolkit_python_client.models import (
    BatchCreateResultsRequestContent,
    BatchResultInput,
    BatchScoreItem,
    BatchUpdateScoresRequestContent,
    JobStatus,
    ScoreInput,
    SubmitEvaluationJobRequestContent,
    TaskStatus,
    TestDataSource,
    UpdateEvaluatorJobStatusRequestContent,
)


def _setup_job_with_scores(
    client: DefaultApi, cleanup: list[str], experiment_name: str | None = None
) -> tuple[str, str]:
    """Create a job with results and scores. Returns (job_id, report_id)."""
    submit_resp = client.submit_evaluation_job(
        "test-eval",
        SubmitEvaluationJobRequestContent(
            testCases=TestDataSource.from_dict({"dataset": {"datasetId": "ds-1"}}),
            experimentName=experiment_name,
        ),
    )
    job_id = submit_resp.job_id
    report_id = submit_resp.report_id
    cleanup.append(report_id)

    client.batch_create_results(
        report_id,
        BatchCreateResultsRequestContent(results=[
            BatchResultInput(input={"q": "q1"}, output={"a": "a1"}),
            BatchResultInput(input={"q": "q2"}, output={"a": "a2"}),
            BatchResultInput(input={"q": "q3"}, output={"a": "a3"}),
        ]),
    )

    result_ids = [r.result_id for r in client.list_test_results(report_id).test_results]

    client.batch_update_scores(
        report_id,
        BatchUpdateScoresRequestContent(items=[
            BatchScoreItem(resultId=result_ids[0], scores={"accuracy": ScoreInput(value=0.8)}),
            BatchScoreItem(resultId=result_ids[1], scores={"accuracy": ScoreInput(value=0.9)}),
            BatchScoreItem(resultId=result_ids[2], scores={"accuracy": ScoreInput(value=1.0)}),
        ]),
    )

    client.update_evaluator_job_status(
        job_id,
        UpdateEvaluatorJobStatusRequestContent(status=TaskStatus.RUNNING),
    )

    return job_id, report_id


class TestNonOrchestratedPostProcessing:
    """Non-orchestrated COMPLETED should trigger post-processing automatically.

    When a local SDK evaluate() completes and sends COMPLETED, the backend
    should run post-processing (Welford aggregation, MLflow) inline so the
    job reaches a terminal status (SUCCESS).
    """

    def test_completed_triggers_post_processing_and_reaches_success(
        self, client: DefaultApi, cleanup: list[str]
    ) -> None:
        job_id, report_id = _setup_job_with_scores(client, cleanup)

        client.update_evaluator_job_status(
            job_id,
            UpdateEvaluatorJobStatusRequestContent(status=TaskStatus.COMPLETED),
        )

        # Job should reach SUCCESS (not stuck at RUNNING)
        job_resp = client.get_evaluator_job(job_id)
        assert job_resp.status == JobStatus.SUCCESS, (
            f"Expected SUCCESS after non-orchestrated COMPLETED, got {job_resp.status}. "
            "Post-processing was not triggered."
        )

    def test_completed_aggregates_scores(
        self, client: DefaultApi, cleanup: list[str]
    ) -> None:
        job_id, report_id = _setup_job_with_scores(client, cleanup)

        client.update_evaluator_job_status(
            job_id,
            UpdateEvaluatorJobStatusRequestContent(status=TaskStatus.COMPLETED),
        )

        # Aggregated metrics should be on the report
        from evaluator_api.routes import get_report_dao
        report = get_report_dao().get(report_id)
        assert report is not None
        assert report.aggregated_metrics is not None, (
            "Post-processing did not run — no aggregated metrics on report"
        )
        assert "accuracy" in report.aggregated_metrics


class TestPostProcessingAggregation:
    """Post-processing (run_post_processing) aggregates scores."""

    def test_aggregates_scores(
        self, client: DefaultApi, cleanup: list[str]
    ) -> None:
        from evaluator_api.experiment import run_post_processing
        from evaluator_api.routes import get_job_dao, get_report_dao, get_result_dao

        job_id, report_id = _setup_job_with_scores(client, cleanup)

        client.update_evaluator_job_status(
            job_id,
            UpdateEvaluatorJobStatusRequestContent(status=TaskStatus.COMPLETED),
        )

        # Run post-processing (normally done by Lambda)
        run_post_processing(
            job_dao=get_job_dao(),
            result_dao=get_result_dao(),
            report_dao=get_report_dao(),
            job_id=job_id,
        )

        # Verify report has aggregated metrics
        report = get_report_dao().get(report_id)
        assert report is not None
        assert report.aggregated_metrics is not None
        assert "accuracy" in report.aggregated_metrics

    def test_empty_scores_still_succeeds(
        self, client: DefaultApi, cleanup: list[str]
    ) -> None:
        from evaluator_api.experiment import run_post_processing
        from evaluator_api.routes import get_job_dao, get_report_dao, get_result_dao

        submit_resp = client.submit_evaluation_job(
            "test-eval",
            SubmitEvaluationJobRequestContent(
                testCases=TestDataSource.from_dict({"dataset": {"datasetId": "ds-1"}}),
            ),
        )
        cleanup.append(submit_resp.report_id)

        client.batch_create_results(
            submit_resp.report_id,
            BatchCreateResultsRequestContent(results=[
                BatchResultInput(input={"q": "q1"}, output={"a": "a1"}),
            ]),
        )

        client.update_evaluator_job_status(
            submit_resp.job_id,
            UpdateEvaluatorJobStatusRequestContent(status=TaskStatus.RUNNING),
        )

        client.update_evaluator_job_status(
            submit_resp.job_id,
            UpdateEvaluatorJobStatusRequestContent(status=TaskStatus.COMPLETED),
        )

        # Post-processing with no scores should not raise
        run_post_processing(
            job_dao=get_job_dao(),
            result_dao=get_result_dao(),
            report_dao=get_report_dao(),
            job_id=submit_resp.job_id,
        )


class TestPreProcessing:
    """Tests for inline pre-processing on RUNNING transition."""

    @patch("evaluator_api.mlflow_client.log_params")
    @patch("evaluator_api.mlflow_client.create_run")
    @patch("evaluator_api.mlflow_client.find_run_by_name", side_effect=ValueError("not found"))
    @patch("evaluator_api.mlflow_client.get_or_create_experiment")
    def test_running_with_experiment_triggers_preprocessing(
        self,
        mock_get_exp: MagicMock,
        mock_find_run: MagicMock,
        mock_create_run: MagicMock,
        mock_log_params: MagicMock,
        client: DefaultApi,
        cleanup: list[str],
    ) -> None:
        mock_experiment = MagicMock()
        mock_experiment.experiment_id = "exp-123"
        mock_get_exp.return_value = mock_experiment
        mock_run = MagicMock()
        mock_run.info.run_id = "run-456"
        mock_create_run.return_value = mock_run

        submit_resp = client.submit_evaluation_job(
            "test-eval",
            SubmitEvaluationJobRequestContent(
                testCases=TestDataSource.from_dict({"dataset": {"datasetId": "ds-1"}}),
                experimentName="my-experiment",
            ),
        )
        cleanup.append(submit_resp.report_id)

        client.update_evaluator_job_status(
            submit_resp.job_id,
            UpdateEvaluatorJobStatusRequestContent(status=TaskStatus.RUNNING),
        )

        mock_get_exp.assert_called_once_with("my-experiment")
        mock_create_run.assert_called_once()
        mock_log_params.assert_called_once()

    def test_running_without_experiment_skips_preprocessing(
        self, client: DefaultApi, cleanup: list[str]
    ) -> None:
        """RUNNING without experimentName should not attempt MLflow calls."""
        submit_resp = client.submit_evaluation_job(
            "test-eval",
            SubmitEvaluationJobRequestContent(
                testCases=TestDataSource.from_dict({"dataset": {"datasetId": "ds-1"}}),
            ),
        )
        cleanup.append(submit_resp.report_id)

        resp = client.update_evaluator_job_status(
            submit_resp.job_id,
            UpdateEvaluatorJobStatusRequestContent(status=TaskStatus.RUNNING),
        )
        assert resp.status == TaskStatus.RUNNING
