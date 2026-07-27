"""Tests for the EventBridge-triggered post-processing handler."""

from unittest.mock import MagicMock, patch

from evaluator_api.post_processing_handler import handler


class TestPostProcessingHandler:
    @patch("evaluator_api.post_processing_handler.complete_task")
    @patch("evaluator_api.post_processing_handler.run_post_processing")
    @patch("evaluator_api.post_processing_handler._get_daos")
    def test_handler_extracts_detail_and_calls_post_processing(
        self, mock_get_daos: MagicMock, mock_run: MagicMock, mock_complete: MagicMock,
    ) -> None:
        mock_job_dao = MagicMock()
        mock_result_dao = MagicMock()
        mock_report_dao = MagicMock()
        mock_get_daos.return_value = (mock_job_dao, mock_result_dao, mock_report_dao)
        mock_run.return_value = "COMPLETED"

        event = {
            "detail": {
                "jobId": "job-123",
                "reportId": "report-456",
                "taskToken": "tok-abc",
                "taskKey": "post_process",
                "jobType": "POST_PROCESS",
            }
        }
        mock_context = MagicMock()

        result = handler(event, mock_context)

        mock_run.assert_called_once_with(
            job_dao=mock_job_dao,
            result_dao=mock_result_dao,
            report_dao=mock_report_dao,
            job_id="job-123",
            checkpoint=None,
            context=mock_context,
            task_token="tok-abc",
            task_key="post_process",
            continue_buffer_ms=None,
        )
        mock_complete.assert_called_once_with("job-123", "post_process", "COMPLETED", "tok-abc")
        assert result["statusCode"] == 200

    @patch("evaluator_api.post_processing_handler.complete_task")
    @patch("evaluator_api.post_processing_handler.run_post_processing")
    @patch("evaluator_api.post_processing_handler._get_daos")
    def test_handler_calls_complete_task_failed_on_error(
        self, mock_get_daos: MagicMock, mock_run: MagicMock, mock_complete: MagicMock,
    ) -> None:
        mock_get_daos.return_value = (MagicMock(), MagicMock(), MagicMock())
        mock_run.side_effect = RuntimeError("boom")

        event = {
            "detail": {
                "jobId": "job-456",
                "taskToken": "tok-def",
                "taskKey": "post_process",
            }
        }

        result = handler(event, MagicMock())

        mock_complete.assert_called_once_with(
            "job-456", "post_process", "FAILED", "tok-def", error="boom",
        )
        assert result["statusCode"] == 200

    def test_missing_detail_returns_400(self) -> None:
        result = handler({"detail": {}}, None)
        assert result["statusCode"] == 400

    def test_missing_job_id_returns_400(self) -> None:
        result = handler({"detail": {"evaluatorName": "x"}}, None)
        assert result["statusCode"] == 400

    @patch("evaluator_api.post_processing_handler.complete_task")
    @patch("evaluator_api.post_processing_handler.run_post_processing")
    @patch("evaluator_api.post_processing_handler._get_daos")
    def test_minimal_detail_with_only_job_id(
        self, mock_get_daos: MagicMock, mock_run: MagicMock, mock_complete: MagicMock,
    ) -> None:
        mock_get_daos.return_value = (MagicMock(), MagicMock(), MagicMock())
        mock_run.return_value = "COMPLETED"
        result = handler({"detail": {"jobId": "j1"}}, MagicMock())
        assert result["statusCode"] == 200
        mock_run.assert_called_once()
