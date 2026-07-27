"""Unit tests for the RAGAS scorer."""

from unittest.mock import MagicMock, patch

import pytest
from evaluator_sdk import Evaluator, ScoreResult

from evaluator_builtin.scorers.ragas import (
    RagasScorer,
    _build_multi_turn_sample,
    _build_single_turn_sample,
)


class TestBuildSingleTurnSample:
    def test_standard_fields(self) -> None:
        sample = _build_single_turn_sample(
            {"user_input": "What is X?", "retrieved_contexts": ["ctx"]},
            {"response": "X is a thing"},
            {"reference": "X is a concept"},
        )
        assert sample.user_input == "What is X?"
        assert sample.response == "X is a thing"
        assert sample.reference == "X is a concept"
        assert sample.retrieved_contexts == ["ctx"]

    def test_retrieved_contexts_from_output(self) -> None:
        sample = _build_single_turn_sample(
            {"user_input": "hi"},
            {"response": "hello", "retrieved_contexts": ["from output"]},
            None,
        )
        assert sample.retrieved_contexts == ["from output"]

    def test_missing_fields_default_empty(self) -> None:
        sample = _build_single_turn_sample({}, {}, None)
        assert sample.user_input == ""
        assert sample.response == ""
        assert sample.reference == ""
        assert sample.retrieved_contexts == []


class TestBuildMultiTurnSample:
    def test_merges_input_and_output_messages(self) -> None:
        sample = _build_multi_turn_sample(
            {"messages": [{"type": "human", "content": "Hello"}]},
            {"messages": [{"type": "ai", "content": "Hi there"}]},
            None,
        )
        assert len(sample.user_input) == 2

    def test_with_tool_calls(self) -> None:
        sample = _build_multi_turn_sample(
            {"messages": [{"type": "human", "content": "Check weather"}]},
            {
                "messages": [
                    {
                        "type": "ai",
                        "content": "Checking...",
                        "toolCalls": [{"name": "get_weather", "args": {"city": "London"}}],
                    },
                    {"type": "tool", "content": "15C, cloudy"},
                ],
            },
            {
                "reference_tool_calls": [{"name": "get_weather", "args": {"city": "London"}}],
                "reference_topics": ["weather"],
            },
        )
        assert len(sample.user_input) == 3
        assert len(sample.reference_tool_calls) == 1
        assert sample.reference_topics == ["weather"]

    def test_toolCalls_field_mapped_to_reference_tool_calls(self) -> None:
        """GTG generates 'toolCalls' but RAGAS expects 'reference_tool_calls'."""
        sample = _build_multi_turn_sample(
            {"messages": [{"type": "human", "content": "Book a flight"}]},
            {"messages": [{"type": "ai", "content": "Done"}]},
            {
                "toolCalls": [{"name": "book_flight", "args": {"dest": "NYC"}}],
            },
        )
        assert len(sample.reference_tool_calls) == 1
        assert sample.reference_tool_calls[0].name == "book_flight"

    def test_nested_toolCalls_flattened(self) -> None:
        """GTG multi-turn format has toolCalls as list of lists (one per turn)."""
        sample = _build_multi_turn_sample(
            {"messages": [{"type": "human", "content": "Multi-turn"}]},
            {"messages": [{"type": "ai", "content": "Done"}]},
            {
                "toolCalls": [
                    [{"name": "tool1", "args": {"a": 1}}],
                    [{"name": "tool2", "args": {"b": 2}}, {"name": "tool3", "args": {"c": 3}}],
                ],
            },
        )
        assert len(sample.reference_tool_calls) == 3
        assert [tc.name for tc in sample.reference_tool_calls] == ["tool1", "tool2", "tool3"]

    def test_reference_tool_calls_takes_precedence_over_toolCalls(self) -> None:
        """If both fields exist, reference_tool_calls takes precedence."""
        sample = _build_multi_turn_sample(
            {"messages": []},
            {"messages": []},
            {
                "reference_tool_calls": [{"name": "preferred", "args": {}}],
                "toolCalls": [{"name": "ignored", "args": {}}],
            },
        )
        assert len(sample.reference_tool_calls) == 1
        assert sample.reference_tool_calls[0].name == "preferred"

    def test_invalid_toolCalls_type_raises_error(self) -> None:
        """Non-list toolCalls should raise TypeError with helpful message."""
        with pytest.raises(TypeError) as exc_info:
            _build_multi_turn_sample(
                {"messages": []},
                {"messages": []},
                {"toolCalls": {"name": "tool1", "args": {}}},  # dict instead of list
            )
        assert "must be a list" in str(exc_info.value)
        assert "dict" in str(exc_info.value)

    def test_invalid_reference_tool_calls_type_raises_error(self) -> None:
        """Non-list reference_tool_calls should raise TypeError with helpful message."""
        with pytest.raises(TypeError) as exc_info:
            _build_multi_turn_sample(
                {"messages": []},
                {"messages": []},
                {"reference_tool_calls": {"name": "tool1", "args": {}}},  # dict instead of list
            )
        assert "must be a list" in str(exc_info.value)
        assert "dict" in str(exc_info.value)

    def test_empty_messages(self) -> None:
        sample = _build_multi_turn_sample({}, {}, None)
        assert sample.user_input == []


def _make_evaluator() -> Evaluator:
    return Evaluator(
        name="test-ragas",
        scorers=[RagasScorer],
        local_only=True,
    )


class TestRagasScorer:
    @patch("evaluator_builtin.scorers.ragas.ragas")
    @patch("evaluator_builtin.scorers.ragas.BedrockEmbeddings")
    @patch("evaluator_builtin.scorers.ragas.ChatBedrock")
    def test_nan_value_returns_error(
        self, mock_chat: MagicMock, mock_embed: MagicMock, mock_ragas: MagicMock
    ) -> None:


        mock_result = MagicMock()
        mock_result.scores = [{"answer_relevancy": float("nan")}]
        mock_ragas.evaluate.return_value = mock_result

        evaluator = _make_evaluator()
        resp = evaluator.score(
            testcases=[{"input": {"user_input": "hi"}, "output": {"response": "hello"}}],
            scorers={"ragas": {"scores": {"answer_relevancy": None}}},
        )

        sr = resp.results[0].scores["ragas.answer_relevancy"]
        assert isinstance(sr, ScoreResult)
        assert sr.error is not None
        assert "NaN" in sr.error

    @patch("evaluator_builtin.scorers.ragas.ragas")
    @patch("evaluator_builtin.scorers.ragas.BedrockEmbeddings")
    @patch("evaluator_builtin.scorers.ragas.ChatBedrock")
    def test_multi_turn_inferred_from_messages(
        self, mock_chat: MagicMock, mock_embed: MagicMock, mock_ragas: MagicMock
    ) -> None:


        mock_result = MagicMock()
        mock_result.scores = [{"topic_adherence": 0.8}]
        mock_ragas.evaluate.return_value = mock_result

        evaluator = _make_evaluator()
        evaluator.score(
            testcases=[{
                "input": {"messages": [{"type": "human", "content": "hi"}]},
                "output": {"messages": [{"type": "ai", "content": "hello"}]},
            }],
            scorers={"ragas": {"scores": {"topic_adherence": None}}},
        )

        # Verify ragas.evaluate was called
        assert mock_ragas.evaluate.call_count == 1

    @patch("evaluator_builtin.scorers.ragas.ragas")
    @patch("evaluator_builtin.scorers.ragas.BedrockEmbeddings")
    @patch("evaluator_builtin.scorers.ragas.ChatBedrock")
    def test_metric_params_forwarded(
        self, mock_chat: MagicMock, mock_embed: MagicMock, mock_ragas: MagicMock
    ) -> None:


        mock_result = MagicMock()
        mock_result.scores = [{"topic_adherence": 0.8}]
        mock_ragas.evaluate.return_value = mock_result

        evaluator = _make_evaluator()
        evaluator.score(
            testcases=[{
                "input": {"messages": []},
                "output": {"messages": [{"type": "ai", "content": "hello"}]},
            }],
            scorers={"ragas": {"scores": {"topic_adherence": {"mode": "precision"}}}},
        )

        call_args = mock_ragas.evaluate.call_args
        metrics = call_args[1]["metrics"] if "metrics" in call_args[1] else call_args[0][1]
        assert len(metrics) == 1

    @patch("evaluator_builtin.scorers.ragas.ragas")
    @patch("evaluator_builtin.scorers.ragas.BedrockEmbeddings")
    @patch("evaluator_builtin.scorers.ragas.ChatBedrock")
    def test_ragas_evaluate_exception(
        self, mock_chat: MagicMock, mock_embed: MagicMock, mock_ragas: MagicMock
    ) -> None:
        mock_ragas.evaluate.side_effect = Exception("connection timeout")

        evaluator = _make_evaluator()
        resp = evaluator.score(
            testcases=[{"input": {"user_input": "hi"}, "output": {"response": "hello"}}],
            scorers={"ragas": {"scores": {"answer_relevancy": None}}},
        )

        sr = resp.results[0].scores["ragas.answer_relevancy"]
        assert isinstance(sr, ScoreResult)
        assert sr.error is not None
        assert "RAGAS evaluation failed" in sr.error

    @patch("evaluator_builtin.scorers.ragas.BedrockEmbeddings")
    @patch("evaluator_builtin.scorers.ragas.ChatBedrock")
    def test_clients_cached(self, mock_chat: MagicMock, mock_embed: MagicMock) -> None:
        scorer = RagasScorer()
        scorer._get_clients("model-a", "embed-a", None)
        scorer._get_clients("model-a", "embed-a", None)
        assert mock_chat.call_count == 1

    @patch("evaluator_builtin.scorers.ragas.BedrockEmbeddings")
    @patch("evaluator_builtin.scorers.ragas.ChatBedrock")
    def test_clients_recreated_on_change(self, mock_chat: MagicMock, mock_embed: MagicMock) -> None:
        scorer = RagasScorer()
        scorer._get_clients("model-a", "embed-a", None)
        scorer._get_clients("model-b", "embed-a", None)
        assert mock_chat.call_count == 2
