"""Tests for evaluator_sdk.log_context — job-scoped log context for tracing."""

import logging

import pytest

from evaluator_sdk.log_context import (
    clear_job_context,
    job_log_context,
    set_job_context,
)


class TestJobLogContext:
    """Context manager injects fields into log records."""

    def test_fields_present_inside_context(self, caplog: pytest.LogCaptureFixture) -> None:
        with caplog.at_level(logging.INFO):
            with job_log_context(job_id="j1", job_type="FULL", evaluator_name="builtin"):
                logging.getLogger("test").info("inside")

        record = caplog.records[0]
        assert record.job_id == "j1"  # type: ignore[attr-defined]
        assert record.job_type == "FULL"  # type: ignore[attr-defined]
        assert record.evaluator_name == "builtin"  # type: ignore[attr-defined]

    def test_fields_empty_outside_context(self, caplog: pytest.LogCaptureFixture) -> None:
        with caplog.at_level(logging.INFO):
            with job_log_context(job_id="j1"):
                pass
            logging.getLogger("test").info("outside")

        record = caplog.records[0]
        assert record.job_id == ""  # type: ignore[attr-defined]

    def test_nested_contexts_restore(self, caplog: pytest.LogCaptureFixture) -> None:
        with caplog.at_level(logging.INFO):
            with job_log_context(job_id="outer"):
                with job_log_context(job_id="inner"):
                    logging.getLogger("test").info("inner")
                logging.getLogger("test").info("restored")

        assert caplog.records[0].job_id == "inner"  # type: ignore[attr-defined]
        assert caplog.records[1].job_id == "outer"  # type: ignore[attr-defined]

    def test_context_cleared_on_exception(self, caplog: pytest.LogCaptureFixture) -> None:
        try:
            with job_log_context(job_id="fail"):
                raise ValueError("boom")
        except ValueError:
            pass

        with caplog.at_level(logging.INFO):
            logging.getLogger("test").info("after exception")

        assert caplog.records[0].job_id == ""  # type: ignore[attr-defined]

    def test_defaults_when_no_context_set(self, caplog: pytest.LogCaptureFixture) -> None:
        with caplog.at_level(logging.INFO):
            logging.getLogger("test").info("no context")

        record = caplog.records[0]
        assert record.job_id == ""  # type: ignore[attr-defined]
        assert record.job_type == ""  # type: ignore[attr-defined]
        assert record.evaluator_name == ""  # type: ignore[attr-defined]


class TestSetClearJobContext:
    """Manual set/clear API works correctly."""

    def test_set_then_clear(self, caplog: pytest.LogCaptureFixture) -> None:
        set_job_context(job_id="manual", job_type="SCORE", evaluator_name="test-eval")

        with caplog.at_level(logging.INFO):
            logging.getLogger("test").info("during")

        assert caplog.records[0].job_id == "manual"  # type: ignore[attr-defined]
        assert caplog.records[0].job_type == "SCORE"  # type: ignore[attr-defined]

        clear_job_context()
        caplog.clear()

        with caplog.at_level(logging.INFO):
            logging.getLogger("test").info("after clear")

        assert caplog.records[0].job_id == ""  # type: ignore[attr-defined]

    def test_optional_fields_default_empty(self, caplog: pytest.LogCaptureFixture) -> None:
        set_job_context(job_id="minimal")

        with caplog.at_level(logging.INFO):
            logging.getLogger("test").info("minimal")

        record = caplog.records[0]
        assert record.job_id == "minimal"  # type: ignore[attr-defined]
        assert record.job_type == ""  # type: ignore[attr-defined]
        assert record.evaluator_name == ""  # type: ignore[attr-defined]

        clear_job_context()


class TestCrossLoggerPropagation:
    """Context propagates to any logger in the process."""

    def test_different_loggers_see_context(self, caplog: pytest.LogCaptureFixture) -> None:
        with caplog.at_level(logging.INFO):
            with job_log_context(job_id="shared"):
                logging.getLogger("evaluator_sdk").info("sdk")
                logging.getLogger("evaluator_builtin.scorers").info("scorer")
                logging.getLogger("boto3").info("boto")

        for record in caplog.records:
            assert record.job_id == "shared"  # type: ignore[attr-defined]
