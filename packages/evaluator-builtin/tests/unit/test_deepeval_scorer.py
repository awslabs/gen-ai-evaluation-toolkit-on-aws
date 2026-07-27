"""Unit tests for DeepEval scorer."""

import pytest
from evaluator_sdk import TestResult

from evaluator_builtin.scorers.deepeval import (
    ALL_METRICS,
    CONVERSATIONAL_METRICS,
    SINGLE_TURN_METRICS,
    DeepEvalScorer,
    _build_conversational_test_case,
    _build_metric,
    _build_single_turn_test_case,
    _convert_messages_to_turns,
)


class TestConvertMessagesToTurns:
    """Tests for _convert_messages_to_turns mapping."""

    def test_basic_human_ai_messages(self) -> None:
        messages = [
            {"type": "human", "content": "Hello"},
            {"type": "ai", "content": "Hi there!"},
        ]
        turns = _convert_messages_to_turns(messages)
        assert len(turns) == 2
        assert turns[0].role == "user"
        assert turns[0].content == "Hello"
        assert turns[1].role == "assistant"
        assert turns[1].content == "Hi there!"

    def test_deepeval_native_format(self) -> None:
        messages = [
            {"role": "user", "content": "Hello"},
            {"role": "assistant", "content": "Hi there!"},
        ]
        turns = _convert_messages_to_turns(messages)
        assert len(turns) == 2
        assert turns[0].role == "user"
        assert turns[1].role == "assistant"

    def test_tool_calls_mapped_to_turn(self) -> None:
        messages = [
            {"type": "human", "content": "What are tablet specs?"},
            {
                "type": "ai",
                "content": "Let me look that up.",
                "tool_calls": [
                    {"name": "get_product_info", "args": {"product_type": "tablets"}}
                ],
            },
        ]
        turns = _convert_messages_to_turns(messages)
        assert len(turns) == 2
        assert turns[1].tools_called is not None
        assert len(turns[1].tools_called) == 1
        assert turns[1].tools_called[0].name == "get_product_info"
        assert turns[1].tools_called[0].input_parameters == {"product_type": "tablets"}
        assert turns[1].tools_called[0].output is None

    def test_tool_result_merged_into_previous_turn(self) -> None:
        messages = [
            {"type": "human", "content": "What are tablet specs?"},
            {
                "type": "ai",
                "content": "Let me look that up.",
                "tool_calls": [
                    {"name": "get_product_info", "args": {"product_type": "tablets"}}
                ],
            },
            {"type": "tool", "content": "10-12 inch displays, all-day battery life"},
        ]
        turns = _convert_messages_to_turns(messages)
        assert len(turns) == 2
        assert turns[1].tools_called[0].output == "10-12 inch displays, all-day battery life"

    def test_multiple_tool_calls_with_results(self) -> None:
        messages = [
            {"type": "human", "content": "Compare tablets and laptops"},
            {
                "type": "ai",
                "content": "Let me check both.",
                "tool_calls": [
                    {"name": "get_product_info", "args": {"type": "tablets"}},
                    {"name": "get_product_info", "args": {"type": "laptops"}},
                ],
            },
            {"type": "tool", "content": "Tablets: 10-12 inch displays"},
            {"type": "tool", "content": "Laptops: 13-16 inch displays"},
        ]
        turns = _convert_messages_to_turns(messages)
        assert len(turns) == 2
        assert len(turns[1].tools_called) == 2
        assert turns[1].tools_called[0].output == "Tablets: 10-12 inch displays"
        assert turns[1].tools_called[1].output == "Laptops: 13-16 inch displays"

    def test_tool_call_with_preexisting_output(self) -> None:
        """Tool calls that already have output should not be overwritten."""
        messages = [
            {
                "type": "ai",
                "content": "Done.",
                "tool_calls": [
                    {"name": "search", "args": {"q": "test"}, "output": "existing result"}
                ],
            },
            {"type": "tool", "content": "this should go to last tc"},
        ]
        turns = _convert_messages_to_turns(messages)
        assert turns[0].tools_called[0].output == "this should go to last tc"

    def test_tool_message_without_preceding_assistant(self) -> None:
        """Tool message at start with no preceding assistant turn is dropped."""
        messages = [
            {"type": "tool", "content": "orphaned tool result"},
            {"type": "human", "content": "Hello"},
        ]
        turns = _convert_messages_to_turns(messages)
        assert len(turns) == 1
        assert turns[0].role == "user"

    def test_preserves_message_order(self) -> None:
        messages = [
            {"type": "human", "content": "Turn 1"},
            {"type": "ai", "content": "Response 1"},
            {"type": "human", "content": "Turn 2"},
            {"type": "ai", "content": "Response 2"},
            {"type": "human", "content": "Turn 3"},
            {"type": "ai", "content": "Response 3"},
        ]
        turns = _convert_messages_to_turns(messages)
        assert len(turns) == 6
        assert [t.content for t in turns] == [
            "Turn 1", "Response 1", "Turn 2", "Response 2", "Turn 3", "Response 3"
        ]

    def test_empty_messages(self) -> None:
        turns = _convert_messages_to_turns([])
        assert turns == []


class TestBuildSingleTurnTestCase:
    """Tests for _build_single_turn_test_case."""

    def test_basic_text_fields(self) -> None:
        tc = _build_single_turn_test_case(
            input={"text": "What is Python?"},
            output={"response": "A programming language."},
            expected=None,
        )
        assert tc.input == "What is Python?"
        assert tc.actual_output == "A programming language."
        assert tc.expected_output is None

    def test_reference_sets_expected_output(self) -> None:
        tc = _build_single_turn_test_case(
            input={"text": "Capital of France?"},
            output={"response": "Paris"},
            expected={"reference": "Paris"},
        )
        assert tc.expected_output == "Paris"

    def test_missing_text_raises(self) -> None:
        with pytest.raises(ValueError, match=r"input\['text'\]"):
            _build_single_turn_test_case(input={}, output={"response": "x"}, expected=None)

    def test_missing_response_raises(self) -> None:
        with pytest.raises(ValueError, match=r"output\['response'\]"):
            _build_single_turn_test_case(input={"text": "q"}, output={}, expected=None)

    def test_retrieved_contexts(self) -> None:
        tc = _build_single_turn_test_case(
            input={"text": "What is X?", "retrieved_contexts": ["doc1", "doc2"]},
            output={"response": "X is Y."},
            expected=None,
        )
        assert tc.retrieval_context == ["doc1", "doc2"]
        assert tc.context == ["doc1", "doc2"]

    def test_retrieved_contexts_bare_string_raises(self) -> None:
        # A bare string would be char-iterated by DeepEval -> fail clearly instead.
        with pytest.raises(ValueError, match=r"retrieved_contexts.*list of strings"):
            _build_single_turn_test_case(
                input={"text": "q", "retrieved_contexts": "a single doc"},
                output={"response": "a"},
                expected=None,
            )

    def test_retrieved_contexts_non_string_elements_raise(self) -> None:
        with pytest.raises(ValueError, match=r"retrieved_contexts.*list of strings"):
            _build_single_turn_test_case(
                input={"text": "q", "retrieved_contexts": ["ok", 123]},
                output={"response": "a"},
                expected=None,
            )

    def test_tools_called_from_output(self) -> None:
        tc = _build_single_turn_test_case(
            input={"text": "Search for X"},
            output={
                "response": "Found X.",
                "tool_calls": [{"name": "search", "args": {"q": "X"}, "output": "result"}],
            },
            expected=None,
        )
        assert tc.tools_called is not None
        assert len(tc.tools_called) == 1
        assert tc.tools_called[0].name == "search"
        assert tc.tools_called[0].input_parameters == {"q": "X"}
        assert tc.tools_called[0].output == "result"

    def test_expected_tools(self) -> None:
        tc = _build_single_turn_test_case(
            input={"text": "Do something"},
            output={"response": "Done."},
            expected={"tools": [{"name": "tool_a", "args": {"x": 1}}]},
        )
        assert tc.expected_tools is not None
        assert tc.expected_tools[0].name == "tool_a"


class TestBuildConversationalTestCase:
    """Tests for _build_conversational_test_case."""

    def test_basic_messages(self) -> None:
        tc = _build_conversational_test_case(
            input={},
            output={"messages": [
                {"type": "human", "content": "Hi"},
                {"type": "ai", "content": "Hello!"},
            ]},
            expected=None,
        )
        assert len(tc.turns) == 2

    def test_scenario_and_expected_outcome(self) -> None:
        tc = _build_conversational_test_case(
            input={"scenario": "Customer support chat"},
            output={"messages": [
                {"type": "human", "content": "I need help"},
                {"type": "ai", "content": "How can I help?"},
            ]},
            expected={"expected_outcome": "Customer issue resolved"},
        )
        assert tc.scenario == "Customer support chat"
        assert tc.expected_outcome == "Customer issue resolved"

    def test_chatbot_role(self) -> None:
        tc = _build_conversational_test_case(
            input={"chatbot_role": "Technical support agent"},
            output={"messages": [
                {"type": "human", "content": "My app crashed"},
                {"type": "ai", "content": "Let me help troubleshoot."},
            ]},
            expected=None,
        )
        assert tc.chatbot_role == "Technical support agent"

    def test_empty_messages_raises(self) -> None:
        with pytest.raises(ValueError, match="Conversational metrics require"):
            _build_conversational_test_case(
                input={},
                output={"messages": []},
                expected=None,
            )

    def test_retrieved_contexts(self) -> None:
        """input['retrieved_contexts'] populates the conversational context."""
        tc = _build_conversational_test_case(
            input={"retrieved_contexts": ["policy doc"]},
            output={"messages": [
                {"type": "human", "content": "Hey"},
                {"type": "ai", "content": "Yo"},
            ]},
            expected=None,
        )
        assert tc.context == ["policy doc"]


class TestBuildMetric:
    """Tests for _build_metric constructor parameter handling."""

    def test_simple_metric_no_extra_params(self) -> None:
        metric = _build_metric(
            "bias", ALL_METRICS["bias"],
            {"model_id": "us.amazon.nova-lite-v1:0", "region": "us-east-1"},
        )
        assert metric is not None

    def test_required_param_missing_raises(self) -> None:
        # Missing required kwargs surface as DeepEval's own TypeError; the scorer's
        # outer handler catches TypeError and returns it as a ScoreResult error.
        with pytest.raises(TypeError, match="prompt_instructions"):
            _build_metric(
                "prompt_alignment", ALL_METRICS["prompt_alignment"],
                {"region": "us-east-1"},
            )

    def test_required_param_provided(self) -> None:
        metric = _build_metric(
            "prompt_alignment",
            ALL_METRICS["prompt_alignment"],
            {"prompt_instructions": ["Be concise", "Use formal tone"], "region": "us-east-1"},
        )
        assert metric is not None

    def test_exact_match_no_model(self) -> None:
        """ExactMatch doesn't use an LLM model — no region needed."""
        metric = _build_metric("exact_match", ALL_METRICS["exact_match"], {})
        assert metric is not None

    def test_pattern_match_with_params(self) -> None:
        """PatternMatch doesn't use an LLM model either."""
        metric = _build_metric(
            "pattern_match",
            ALL_METRICS["pattern_match"],
            {"pattern": r"\d{4}-\d{2}-\d{2}", "ignore_case": True},
        )
        assert metric is not None

    def test_scorer_owned_kwargs_cannot_be_overridden(self) -> None:
        """Users can't override threshold / include_reason / async_mode / model."""
        metric = _build_metric(
            "bias", ALL_METRICS["bias"],
            {
                "region": "us-east-1",
                "threshold": 0.99,
                "include_reason": False,
                "async_mode": True,
                "model": "definitely-not-a-real-model",
            },
        )
        assert metric.threshold == 0.5
        assert metric.include_reason is True
        assert metric.async_mode is False
        # AmazonBedrockModel built by the scorer, not the user's string.
        assert not isinstance(metric.model, str)

    def test_scorer_level_params_not_forwarded_to_metric(self) -> None:
        """model_id / region configure the Bedrock judge; they are not metric kwargs.

        ``pattern_match`` is a no-model metric — its constructor doesn't accept
        ``region``. If ``_SCORER_LEVEL_PARAMS`` filtering regresses, this build
        raises TypeError.
        """
        metric = _build_metric(
            "pattern_match", ALL_METRICS["pattern_match"],
            {"pattern": r"\d+", "region": "us-east-1", "model_id": "us.amazon.nova-lite-v1:0"},
        )
        assert metric is not None
        assert not hasattr(metric, "region")
        assert not hasattr(metric, "model_id")


class TestEvaluateErrorHandling:
    """End-to-end tests for _evaluate() error surfacing.

    Confirms the outer handler catches DeepEval's TypeError (missing required
    kwargs) and unknown-score errors, and returns them as ScoreResult errors
    rather than propagating.
    """

    def test_missing_required_metric_param_returns_error(self) -> None:
        scorer = DeepEvalScorer()
        result = scorer._evaluate(
            score_name="prompt_alignment",
            score_params={"region": "us-east-1"},
            test_result=TestResult(input={"text": "hi"}, output={"response": "hello"}),
        )
        assert result.value is None
        assert result.error is not None
        assert "prompt_alignment" in result.error
        assert "prompt_instructions" in result.error

    def test_unknown_score_name_returns_error(self) -> None:
        scorer = DeepEvalScorer()
        result = scorer._evaluate(
            score_name="not_a_real_metric",
            score_params={"region": "us-east-1"},
            test_result=TestResult(input={"text": "hi"}, output={"response": "hello"}),
        )
        assert result.value is None
        assert result.error is not None
        assert "not_a_real_metric" in result.error


class TestMetricRegistry:
    """Tests for the metric registry structure."""

    def test_no_overlap_between_single_and_conversational(self) -> None:
        overlap = set(SINGLE_TURN_METRICS) & set(CONVERSATIONAL_METRICS)
        assert overlap == set()

    def test_all_metrics_is_union(self) -> None:
        assert set(ALL_METRICS) == set(SINGLE_TURN_METRICS) | set(CONVERSATIONAL_METRICS)

    def test_metric_count(self) -> None:
        # Sanity check — we expose a substantial number of metrics
        assert len(ALL_METRICS) >= 35


# ---------------------------------------------------------------------------
# Parametrized tests: instantiate every metric to verify constructor works
# ---------------------------------------------------------------------------

# Extra params needed by metrics that have required constructor arguments
_EXTRA_PARAMS: dict[str, dict] = {
    "prompt_alignment": {"prompt_instructions": ["Be helpful"]},
    "json_correctness": {"expected_schema": {"type": "object"}},
    "pattern_match": {"pattern": r"\d+"},
    "role_violation": {"role": "helpful assistant"},
    "tool_use": {"available_tools": ["search", "calculator"]},
    "topic_adherence": {"relevant_topics": ["weather", "news"]},
    "misuse": {"domain": "healthcare"},
    "non_advice": {"advice_types": ["financial", "legal"]},
}


class TestAllSingleTurnMetrics:
    """Verify every single-turn metric can be instantiated."""

    @pytest.mark.parametrize("score_name", list(SINGLE_TURN_METRICS.keys()))
    def test_build_metric(self, score_name: str) -> None:
        params: dict = {"region": "us-east-1"}
        params.update(_EXTRA_PARAMS.get(score_name, {}))
        metric = _build_metric(score_name, SINGLE_TURN_METRICS[score_name], params)
        assert metric is not None


class TestAllConversationalMetrics:
    """Verify every conversational metric can be instantiated."""

    @pytest.mark.parametrize("score_name", list(CONVERSATIONAL_METRICS.keys()))
    def test_build_metric(self, score_name: str) -> None:
        params: dict = {"region": "us-east-1"}
        params.update(_EXTRA_PARAMS.get(score_name, {}))
        metric = _build_metric(score_name, CONVERSATIONAL_METRICS[score_name], params)
        assert metric is not None
