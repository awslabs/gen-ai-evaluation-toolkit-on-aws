"""DeepEval metrics wrapped as an ETK Scorer.

Supports both single-turn and multi-turn (conversational) metrics using
Amazon Bedrock as the evaluation LLM backend. All metrics are exposed
dynamically — just request them by name via score_name.
"""

from __future__ import annotations

import logging
import os
from typing import Any

# DeepEval writes a telemetry/cache dir at import time. On Lambda the working
# directory is read-only, so opt out of telemetry and point any cache at /tmp
# BEFORE importing deepeval — otherwise the import raises
# OSError: [Errno 30] Read-only file system: '.deepeval'.
os.environ.setdefault("DEEPEVAL_TELEMETRY_OPT_OUT", "YES")
os.environ.setdefault("DEEPEVAL_CACHE_FOLDER", "/tmp/.deepeval")

from deepeval.metrics import (  # noqa: E402
    AnswerRelevancyMetric,
    ArgumentCorrectnessMetric,
    BiasMetric,
    ContextualPrecisionMetric,
    ContextualRecallMetric,
    ContextualRelevancyMetric,
    ConversationCompletenessMetric,
    ExactMatchMetric,
    FaithfulnessMetric,
    GoalAccuracyMetric,
    HallucinationMetric,
    JsonCorrectnessMetric,
    KnowledgeRetentionMetric,
    MCPTaskCompletionMetric,
    MCPUseMetric,
    MisuseMetric,
    MultiTurnMCPUseMetric,
    NonAdviceMetric,
    PatternMatchMetric,
    PIILeakageMetric,
    PlanAdherenceMetric,
    PlanQualityMetric,
    PromptAlignmentMetric,
    RoleAdherenceMetric,
    RoleViolationMetric,
    StepEfficiencyMetric,
    SummarizationMetric,
    TaskCompletionMetric,
    ToolCorrectnessMetric,
    ToolUseMetric,
    TopicAdherenceMetric,
    ToxicityMetric,
    TurnContextualPrecisionMetric,
    TurnContextualRecallMetric,
    TurnContextualRelevancyMetric,
    TurnFaithfulnessMetric,
    TurnRelevancyMetric,
)
from deepeval.models import AmazonBedrockModel  # noqa: E402
from deepeval.test_case import ConversationalTestCase, LLMTestCase  # noqa: E402
from deepeval.test_case.conversational_test_case import Turn  # noqa: E402
from deepeval.test_case.llm_test_case import ToolCall  # noqa: E402
from evaluator_sdk import Scorer, ScoreResult, TestResult, scorer  # noqa: E402

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Metric registry — maps score_name -> (metric class, "single" | "conversational")
# ---------------------------------------------------------------------------

SINGLE_TURN_METRICS: dict[str, type] = {
    "answer_relevancy": AnswerRelevancyMetric,
    "faithfulness": FaithfulnessMetric,
    "contextual_precision": ContextualPrecisionMetric,
    "contextual_recall": ContextualRecallMetric,
    "contextual_relevancy": ContextualRelevancyMetric,
    "hallucination": HallucinationMetric,
    "bias": BiasMetric,
    "toxicity": ToxicityMetric,
    "summarization": SummarizationMetric,
    "json_correctness": JsonCorrectnessMetric,
    "prompt_alignment": PromptAlignmentMetric,
    "exact_match": ExactMatchMetric,
    "pattern_match": PatternMatchMetric,
    "task_completion": TaskCompletionMetric,
    "tool_correctness": ToolCorrectnessMetric,
    "mcp_use": MCPUseMetric,
    "argument_correctness": ArgumentCorrectnessMetric,
    "misuse": MisuseMetric,
    "non_advice": NonAdviceMetric,
    "pii_leakage": PIILeakageMetric,
    "plan_adherence": PlanAdherenceMetric,
    "plan_quality": PlanQualityMetric,
    "role_violation": RoleViolationMetric,
    "step_efficiency": StepEfficiencyMetric,
}

CONVERSATIONAL_METRICS: dict[str, type] = {
    "conversation_completeness": ConversationCompletenessMetric,
    "turn_relevancy": TurnRelevancyMetric,
    "goal_accuracy": GoalAccuracyMetric,
    "knowledge_retention": KnowledgeRetentionMetric,
    "role_adherence": RoleAdherenceMetric,
    "tool_use": ToolUseMetric,
    "topic_adherence": TopicAdherenceMetric,
    "mcp_task_completion": MCPTaskCompletionMetric,
    "multi_turn_mcp_use": MultiTurnMCPUseMetric,
    "turn_contextual_precision": TurnContextualPrecisionMetric,
    "turn_contextual_recall": TurnContextualRecallMetric,
    "turn_contextual_relevancy": TurnContextualRelevancyMetric,
    "turn_faithfulness": TurnFaithfulnessMetric,
}

ALL_METRICS = {**SINGLE_TURN_METRICS, **CONVERSATIONAL_METRICS}

# score_params keys consumed by the scorer itself (Bedrock judge config);
# never forwarded as constructor kwargs to a DeepEval metric.
_SCORER_LEVEL_PARAMS = frozenset({"model_id", "region"})

# Constructor kwargs the scorer owns unconditionally; user-supplied values
# under these names are ignored so scorer semantics stay consistent. threshold
# is fixed because we don't surface pass/fail; include_reason must stay True
# so metric.reason (returned as ScoreResult.reason) is populated; async_mode
# must stay False because Lambda has no reusable event loop; model is always
# built by the scorer from model_id / region so callers can't smuggle in a
# different judge.
_SCORER_OWNED_METRIC_KWARGS = frozenset(
    {"threshold", "include_reason", "async_mode", "model"}
)


def _build_model(params: dict[str, Any]) -> AmazonBedrockModel:
    """Build the Bedrock model from scorer params."""
    return AmazonBedrockModel(
        model=params.get("model_id", "us.amazon.nova-lite-v1:0"),
        region=params.get("region"),
    )


def _to_tool_call(tc: dict[str, Any]) -> ToolCall:
    """Convert an ETK tool call {"name", "args", "output"} to a DeepEval ToolCall."""
    return ToolCall(
        name=tc.get("name", ""),
        input_parameters=tc.get("args"),
        output=tc.get("output"),
    )


def _validate_contexts(contexts: Any) -> list[str]:
    """Validate that retrieved_contexts is a list of strings.

    DeepEval expects ``list[str]``; a bare string would be iterated
    character-by-character and silently produce a meaningless score, so we
    fail clearly instead.
    """
    if not isinstance(contexts, list) or not all(isinstance(c, str) for c in contexts):
        raise ValueError("'retrieved_contexts' must be a list of strings")
    return contexts


def _build_single_turn_test_case(
    input: dict[str, Any],
    output: dict[str, Any],
    expected: dict[str, Any] | None,
) -> LLMTestCase:
    """Convert an ETK single-turn test case to a DeepEval LLMTestCase.

    ETK single-turn schema (one canonical field per concept, no aliases):
        input.text                  -> prompt
        output.response             -> model answer being scored
        input.retrieved_contexts    -> context documents (list[str])
        expected.reference          -> ground-truth answer
        output.tool_calls           -> tools the model called
        expected.tools              -> expected tool calls
    where each tool call is {"name": str, "args": dict, "output": Any}.
    """
    expected = expected or {}

    # input.text (prompt) and output.response (answer being scored) are required
    # by every single-turn metric. Fail clearly rather than passing empty strings
    # to DeepEval, which would silently produce meaningless scores.
    if not input.get("text"):
        raise ValueError("Single-turn metrics require a non-empty input['text']")
    if not output.get("response"):
        raise ValueError("Single-turn metrics require a non-empty output['response']")

    kwargs: dict[str, Any] = {
        "input": input["text"],
        "actual_output": output["response"],
    }

    if expected.get("reference"):
        kwargs["expected_output"] = expected["reference"]

    # DeepEval distinguishes context (ground-truth docs, used by hallucination/
    # summarization) from retrieval_context (retriever output, used by
    # contextual_* metrics). ETK provides one field; populate both.
    contexts = input.get("retrieved_contexts")
    if contexts:
        validated = _validate_contexts(contexts)
        kwargs["context"] = validated
        kwargs["retrieval_context"] = validated

    if output.get("tool_calls"):
        kwargs["tools_called"] = [_to_tool_call(tc) for tc in output["tool_calls"]]

    if expected.get("tools"):
        kwargs["expected_tools"] = [_to_tool_call(tc) for tc in expected["tools"]]

    return LLMTestCase(**kwargs)


_ROLE_MAP = {"human": "user", "ai": "assistant"}


def _convert_messages_to_turns(messages: list[dict[str, Any]]) -> list[Turn]:
    """Convert ETK conversation messages to DeepEval Turns, merging tool results.

    ETK message format (one canonical field per concept):
        [{"type": "human"|"ai"|"tool", "content": "...",
          "tool_calls": [{"name": "x", "args": {...}, "output": ...}]}]
    The DeepEval-native shape ({"role": "user"|"assistant", ...}) is also accepted.

    Tool result messages (type "tool") are merged back into the preceding
    assistant turn's ToolCall.output field rather than becoming separate turns.
    """
    turns: list[Turn] = []

    for msg in messages:
        # ETK uses "type" (human/ai/tool); DeepEval-native uses "role" (user/assistant).
        if "type" in msg:
            msg_type = msg["type"]
        else:
            msg_type = {"user": "human", "assistant": "ai"}.get(msg.get("role", ""), msg.get("role", ""))

        content = msg.get("content", "")

        # Tool result message — merge into previous assistant turn's ToolCall.output
        if msg_type == "tool":
            if turns and turns[-1].tools_called:
                # Attach to the first tool call that has no output yet, or the last one
                for tc in turns[-1].tools_called:
                    if tc.output is None:
                        tc.output = content
                        break
                else:
                    # All tool calls already have output — append to last
                    turns[-1].tools_called[-1].output = content
            continue

        role = _ROLE_MAP.get(msg_type)
        if role is None:
            continue

        tools_called = [_to_tool_call(tc) for tc in msg["tool_calls"]] if msg.get("tool_calls") else None

        turns.append(Turn(role=role, content=content, tools_called=tools_called))  # type: ignore[arg-type]

    return turns


def _build_conversational_test_case(
    input: dict[str, Any],
    output: dict[str, Any],
    expected: dict[str, Any] | None,
) -> ConversationalTestCase:
    """Convert an ETK multi-turn test case to a DeepEval ConversationalTestCase.

    ETK multi-turn schema:
        output.messages             -> conversation transcript (see
                                       _convert_messages_to_turns)
        input.scenario              -> scenario description (optional)
        input.chatbot_role          -> assistant's assigned role (optional)
        input.retrieved_contexts    -> context documents (list[str], optional)
        expected.expected_outcome   -> expected conversation outcome (optional)
    """
    expected = expected or {}
    turns = _convert_messages_to_turns(output.get("messages", []))

    if not turns:
        raise ValueError(
            "Conversational metrics require output['messages'] "
            "with [{'type': 'human'|'ai', 'content': '...'}] entries"
        )

    kwargs: dict[str, Any] = {"turns": turns}

    # Optional conversational test case fields
    if input.get("scenario"):
        kwargs["scenario"] = input["scenario"]
    if expected.get("expected_outcome"):
        kwargs["expected_outcome"] = expected["expected_outcome"]
    if input.get("chatbot_role"):
        kwargs["chatbot_role"] = input["chatbot_role"]
    if input.get("retrieved_contexts"):
        kwargs["context"] = _validate_contexts(input["retrieved_contexts"])

    return ConversationalTestCase(**kwargs)


_NO_MODEL_METRICS = {"exact_match", "pattern_match"}

# Fixed internal threshold for DeepEval's pass/fail flag (metric.success), which
# we do not surface. Not user-configurable since it has no effect on our output.
_DEFAULT_THRESHOLD = 0.5


def _build_metric(score_name: str, metric_cls: type, params: dict[str, Any]) -> Any:
    """Instantiate a DeepEval metric from ``score_params``.

    Every non-scorer key in ``params`` is forwarded to the metric constructor;
    DeepEval itself raises ``TypeError`` on missing or unknown kwargs, so metric
    signature changes across DeepEval versions surface immediately instead of
    silently drifting past a hand-maintained param table.
    """
    # DeepEval metrics require a threshold to set their internal pass/fail flag
    # (metric.success). We only return the raw score and reason, never the
    # pass/fail flag, so the threshold has no effect on our output — it is fixed
    # internally rather than exposed as a scorer param.
    metric_kwargs: dict[str, Any] = {"threshold": _DEFAULT_THRESHOLD}

    # ExactMatch and PatternMatch don't use an LLM model
    if score_name not in _NO_MODEL_METRICS:
        metric_kwargs["model"] = _build_model(params)
        metric_kwargs["include_reason"] = True
        metric_kwargs["async_mode"] = False

    for name, value in params.items():
        if name in _SCORER_LEVEL_PARAMS or name in _SCORER_OWNED_METRIC_KWARGS:
            continue
        metric_kwargs[name] = value

    return metric_cls(**metric_kwargs)


class DeepEvalScorer(Scorer):
    """ETK scorer that wraps DeepEval metrics.

    Supports single-turn metrics (answer_relevancy, faithfulness, contextual_precision,
    contextual_recall, contextual_relevancy, hallucination, bias, toxicity,
    summarization, json_correctness, prompt_alignment, exact_match, pattern_match,
    task_completion, tool_correctness, mcp_use, argument_correctness, misuse,
    non_advice, pii_leakage, plan_adherence, plan_quality, role_violation,
    step_efficiency) and multi-turn conversational metrics (conversation_completeness,
    turn_relevancy, goal_accuracy, knowledge_retention, role_adherence, tool_use,
    topic_adherence, mcp_task_completion, multi_turn_mcp_use,
    turn_contextual_precision, turn_contextual_recall, turn_contextual_relevancy,
    turn_faithfulness).

    Configuration via score_params:
        model_id: Bedrock model ID (default: us.amazon.nova-lite-v1:0).
        region:   AWS region for Bedrock.
        Any other key is forwarded verbatim to the underlying DeepEval metric
        constructor. See DeepEval's per-metric documentation for the params
        each metric accepts (e.g. prompt_alignment needs prompt_instructions,
        pattern_match needs pattern). Missing or unknown kwargs surface as a
        DeepEval TypeError, returned as a ScoreResult error.

    The scorer returns each metric's raw score (0.0-1.0) and reason; it does not
    expose a pass/fail threshold.
    """

    name = "deepeval"
    available_scores = dict.fromkeys(ALL_METRICS)

    @scorer(dynamic=True)
    def _evaluate(
        self,
        score_name: str,
        score_params: dict[str, Any] | None,
        test_result: TestResult,
        params: dict[str, Any] | None = None,
        **kwargs: Any,
    ) -> ScoreResult:
        if score_name not in ALL_METRICS:
            return ScoreResult(error=f"Unknown metric: {score_name}. Available: {list(ALL_METRICS.keys())}")

        input = test_result.input or {}
        output = test_result.output or {}
        expected = test_result.expected

        metric_cls = ALL_METRICS[score_name]
        merged_params = {**(params or {}), **(score_params or {})}

        try:
            metric = _build_metric(score_name, metric_cls, merged_params)
        except (ValueError, TypeError) as e:
            return ScoreResult(error=f"Failed to create metric '{score_name}': {e}")

        try:
            test_case: ConversationalTestCase | LLMTestCase
            if score_name in CONVERSATIONAL_METRICS:
                test_case = _build_conversational_test_case(input, output, expected)
            else:
                test_case = _build_single_turn_test_case(input, output, expected)

            score = metric.measure(test_case)

            return ScoreResult(
                value=score if score is not None else None,
                reason=getattr(metric, "reason", None),
            )
        except Exception as e:
            logger.exception("DeepEval metric %s failed", score_name)
            return ScoreResult(error=str(e))
