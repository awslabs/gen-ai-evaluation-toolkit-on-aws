"""Unit tests for the LLM-as-Judge scorer."""

from unittest.mock import MagicMock, patch

import pytest
from evaluator_sdk import Evaluator, ScoreResult
from pydantic import ValidationError

from evaluator_builtin.scorers.llm_as_judge import (
    ALLOWED_MODEL_ARGS,
    LlmAsJudgeParams,
    LlmAsJudgeScorer,
    LLMEvalScore,
)


def _make_evaluator() -> Evaluator:
    return Evaluator(
        name="test-eval",
        scorers=[LlmAsJudgeScorer],
        local_only=True,
    )


class TestLlmAsJudgeScorer:
    @patch("evaluator_builtin.scorers.llm_as_judge.ChatBedrockConverse")
    def test_validation_error_retries(self, mock_bedrock_cls: MagicMock) -> None:
        from pydantic import ValidationError

        mock_llm = MagicMock()
        mock_structured = MagicMock()
        mock_structured.invoke.side_effect = [
            ValidationError.from_exception_data("test", []),
            ValidationError.from_exception_data("test", []),
            LLMEvalScore(score=0.5, context="Recovered"),
        ]
        mock_llm.with_structured_output.return_value = mock_structured
        mock_bedrock_cls.return_value = mock_llm

        evaluator = _make_evaluator()
        resp = evaluator.score(
            testcases=[{"input": {"q": "hi"}, "output": {"a": "hello"}}],
            scorers={"llm_as_judge": {"scores": {"toxicity": None}}},
        )

        assert resp.results[0].scores["llm_as_judge.toxicity"].value == 0.5
        assert mock_structured.invoke.call_count == 3

    @patch("evaluator_builtin.scorers.llm_as_judge.ChatBedrockConverse")
    def test_all_retries_exhausted(self, mock_bedrock_cls: MagicMock) -> None:
        from pydantic import ValidationError

        mock_llm = MagicMock()
        mock_structured = MagicMock()
        mock_structured.invoke.side_effect = ValidationError.from_exception_data("test", [])
        mock_llm.with_structured_output.return_value = mock_structured
        mock_bedrock_cls.return_value = mock_llm

        evaluator = _make_evaluator()
        resp = evaluator.score(
            testcases=[{"input": {"q": "hi"}, "output": {"a": "hello"}}],
            scorers={"llm_as_judge": {"scores": {"toxicity": None}}},
        )

        sr = resp.results[0].scores["llm_as_judge.toxicity"]
        assert isinstance(sr, ScoreResult)
        assert sr.error is not None
        assert "Failed" in sr.error

    @patch("evaluator_builtin.scorers.llm_as_judge.ChatBedrockConverse")
    def test_model_params_passed_through(self, mock_bedrock_cls: MagicMock) -> None:
        mock_llm = MagicMock()
        mock_structured = MagicMock()
        mock_structured.invoke.return_value = LLMEvalScore(score=0.5, context=None)
        mock_llm.with_structured_output.return_value = mock_structured
        mock_bedrock_cls.return_value = mock_llm

        evaluator = _make_evaluator()
        evaluator.score(
            testcases=[{"input": {"q": "hi"}, "output": {"a": "hello"}}],
            scorers={
                "llm_as_judge": {
                    "params": {
                        "model_id": "anthropic.claude-3-haiku-20240307-v1:0",
                        "model_args": {"temperature": 0.1},
                    },
                    "scores": {"sample": None},
                },
            },
        )

        call_kwargs = mock_bedrock_cls.call_args[1]
        assert call_kwargs["model"] == "anthropic.claude-3-haiku-20240307-v1:0"
        assert call_kwargs["temperature"] == 0.1

    @patch("evaluator_builtin.scorers.llm_as_judge.ChatBedrockConverse")
    def test_default_max_tokens(self, mock_bedrock_cls: MagicMock) -> None:
        mock_llm = MagicMock()
        mock_structured = MagicMock()
        mock_structured.invoke.return_value = LLMEvalScore(score=0.5, context=None)
        mock_llm.with_structured_output.return_value = mock_structured
        mock_bedrock_cls.return_value = mock_llm

        evaluator = _make_evaluator()
        evaluator.score(
            testcases=[{"input": {"q": "hi"}, "output": {"a": "hello"}}],
            scorers={"llm_as_judge": {"scores": {"sample": None}}},
        )

        call_kwargs = mock_bedrock_cls.call_args[1]
        assert call_kwargs["max_tokens"] == 4000

    @patch("evaluator_builtin.scorers.llm_as_judge.ChatBedrockConverse")
    def test_llm_client_cached(self, mock_bedrock_cls: MagicMock) -> None:
        mock_llm = MagicMock()
        mock_structured = MagicMock()
        mock_structured.invoke.return_value = LLMEvalScore(score=0.5, context=None)
        mock_llm.with_structured_output.return_value = mock_structured
        mock_bedrock_cls.return_value = mock_llm

        evaluator = _make_evaluator()
        evaluator.score(
            testcases=[
                {"input": {"q": "1"}, "output": {"a": "1"}},
                {"input": {"q": "2"}, "output": {"a": "2"}},
            ],
            scorers={"llm_as_judge": {"scores": {"sample": None}}},
        )

        assert mock_bedrock_cls.call_count == 1

    @patch("evaluator_builtin.scorers.llm_as_judge.ChatBedrockConverse")
    def test_llm_client_recreated_on_model_change(self, mock_bedrock_cls: MagicMock) -> None:
        mock_llm = MagicMock()
        mock_structured = MagicMock()
        mock_structured.invoke.return_value = LLMEvalScore(score=0.5, context=None)
        mock_llm.with_structured_output.return_value = mock_structured
        mock_bedrock_cls.return_value = mock_llm

        evaluator = _make_evaluator()
        evaluator.score(
            testcases=[{"input": {"q": "1"}, "output": {"a": "1"}}],
            scorers={"llm_as_judge": {"params": {"model_id": "model-a"}, "scores": {"sample": None}}},
        )
        evaluator.score(
            testcases=[{"input": {"q": "2"}, "output": {"a": "2"}}],
            scorers={"llm_as_judge": {"params": {"model_id": "model-b"}, "scores": {"sample": None}}},
        )

        assert mock_bedrock_cls.call_count == 2


class TestModelArgsAllowlist:
    """model_args must be validated against ALLOWED_MODEL_ARGS
    before being spread into ChatBedrockConverse to prevent configuration
    injection (e.g. overriding endpoint_url, credentials_provider)."""

    def test_allowlist_contains_expected_inference_params(self) -> None:
        # Spot-check the safe inference-tuning params; if these are rejected
        # the scorer loses real functionality.
        for key in ("temperature", "max_tokens", "top_p", "top_k", "stop_sequences"):
            assert key in ALLOWED_MODEL_ARGS

    def test_allowlist_excludes_dangerous_keys(self) -> None:
        for key in (
            "endpoint_url",
            "credentials_provider",
            "aws_access_key_id",
            "aws_secret_access_key",
            "aws_session_token",
            "client",
            "config",
            "region_name",
            "provider",
        ):
            assert key not in ALLOWED_MODEL_ARGS, f"{key} must not be in allowlist"

    def test_params_accept_allowed_keys(self) -> None:
        p = LlmAsJudgeParams(model_args={"temperature": 0.7, "max_tokens": 100, "top_p": 0.9})
        assert p.model_args == {"temperature": 0.7, "max_tokens": 100, "top_p": 0.9}

    def test_params_accept_none_and_empty_model_args(self) -> None:
        assert LlmAsJudgeParams().model_args is None
        assert LlmAsJudgeParams(model_args={}).model_args == {}

    def test_params_reject_disallowed_keys(self) -> None:
        with pytest.raises(ValidationError) as exc_info:
            LlmAsJudgeParams(
                model_args={
                    "temperature": 0.5,
                    "endpoint_url": "https://attacker.example.com",
                    "credentials_provider": "evil",
                }
            )
        msg = str(exc_info.value)
        assert "Disallowed model_args keys" in msg
        assert "endpoint_url" in msg
        assert "credentials_provider" in msg

    @patch("evaluator_builtin.scorers.llm_as_judge.ChatBedrockConverse")
    def test_disallowed_model_args_not_forwarded_to_bedrock(self, mock_bedrock_cls: MagicMock) -> None:
        """End-to-end: malicious config keys never reach ChatBedrockConverse."""
        mock_llm = MagicMock()
        mock_structured = MagicMock()
        mock_structured.invoke.return_value = LLMEvalScore(score=0.5, context=None)
        mock_llm.with_structured_output.return_value = mock_structured
        mock_bedrock_cls.return_value = mock_llm

        evaluator = _make_evaluator()
        resp = evaluator.score(
            testcases=[{"input": {"q": "hi"}, "output": {"a": "hello"}}],
            scorers={
                "llm_as_judge": {
                    "params": {
                        "model_args": {
                            "temperature": 0.7,
                            "endpoint_url": "https://attacker.example.com",
                            "aws_access_key_id": "AKIAEVIL",
                        },
                    },
                    "scores": {"sample": None},
                },
            },
        )

        # The scorer rejects the config outright; the client is never built.
        mock_bedrock_cls.assert_not_called()
        sr = resp.results[0].scores["llm_as_judge.sample"]
        assert sr.error is not None
        assert "Disallowed model_args keys" in sr.error
        assert "endpoint_url" in sr.error
        assert "aws_access_key_id" in sr.error
