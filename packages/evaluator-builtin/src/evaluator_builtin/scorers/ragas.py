"""RAGAS scorer — evaluates RAG and agentic systems using the RAGAS framework with Bedrock models."""

import logging
import math
from enum import Enum
from typing import Any

import ragas
from evaluator_sdk import Scorer, ScoreResult, TestResult, scorer
from langchain_aws import BedrockEmbeddings, ChatBedrock
from pydantic import BaseModel, ConfigDict, alias_generators
from ragas.dataset_schema import EvaluationDataset, MultiTurnSample, SingleTurnSample
from ragas.messages import AIMessage, HumanMessage, ToolCall, ToolMessage
from ragas.metrics import (
    AgentGoalAccuracyWithoutReference,
    AgentGoalAccuracyWithReference,
    AnswerAccuracy,
    AnswerRelevancy,
    ContextRecall,
    ContextRelevance,
    Faithfulness,
    LLMContextPrecisionWithoutReference,
    ResponseGroundedness,
    ToolCallAccuracy,
    TopicAdherenceScore,
)

from evaluator_builtin._aws import boto3_config

logger = logging.getLogger(__name__)


class RagasScorer(Scorer):
    """Scorer that evaluates RAG and agentic systems using the RAGAS framework.

    Each score in the ``scores`` dict represents a RAGAS metric:

    Single-turn metrics (RAG evaluation):
    - ``answer_relevancy``, ``answer_accuracy`` — context optional
    - ``response_groundedness``, ``faithfulness``, ``context_relevancy``,
      ``context_precision``, ``context_recall`` — require context

    Multi-turn metrics (agentic evaluation):
    - ``topic_adherence``, ``tool_call_accuracy``,
      ``agent_goal_accuracy``, ``agent_goal_accuracy_with_reference``

    Configuration via ``params``:
    - ``model_id``: Bedrock LLM model ID (default: amazon.nova-micro-v1:0)
    - ``embeddings_id``: Bedrock embeddings model ID (default: amazon.titan-embed-text-v2:0)
    - ``model_args``: Dict of model parameters (temperature, max_tokens, etc.)

    Single-turn vs multi-turn is inferred automatically from the data:
    if ``input`` or ``output`` contains a ``messages`` key, it's multi-turn.

    Single-turn field locations:
    - ``input``: ``user_input``, ``retrieved_contexts`` (optional)
    - ``output``: ``response``, ``retrieved_contexts`` (fallback)
    - ``expected``: ``reference``

    Multi-turn field locations:
    - ``input``: ``messages`` (prior turns)
    - ``output``: ``messages`` (AI response turns)
    - ``expected``: ``reference``, ``reference_tool_calls``, ``reference_topics``

    Example usage::

        evaluator = Evaluator(
            scorers=[RagasScorer],
            local_only=True,
        )
        response = evaluator.score(
            testcases=[
                {
                    "input": {"user_input": "What is X?", "retrieved_contexts": ["X is..."]},
                    "output": {"response": "X is a thing"},
                    "expected": {"reference": "X is a concept"},
                }
            ],
            scorers={
                "ragas": {
                    "params": {"model_id": "amazon.nova-micro-v1:0"},
                    "scores": {
                        "answer_relevancy": None,
                        "faithfulness": None,
                    },
                }
            },
        )
    """

    name = "ragas"

    def __init__(self) -> None:
        self._llm: ChatBedrock | None = None
        self._embeddings: BedrockEmbeddings | None = None
        self._current_model_id: str | None = None
        self._current_embeddings_id: str | None = None
        self._current_model_args: dict[str, Any] | None = None

    @scorer(dynamic=True)
    def _generic_scorer(
        self,
        score_name: str,
        score_params: dict[str, Any] | None,
        test_result: TestResult,
        params: dict[str, Any] | None = None,
    ) -> ScoreResult:
        if score_name not in SUPPORTED_METRICS:
            return ScoreResult(
                error=f"Unknown RAGAS metric '{score_name}'. Available: {list(SUPPORTED_METRICS.keys())}"
            )

        input = test_result.input
        output = test_result.output
        expected = test_result.expected

        p = RagasParams.model_validate(params or {})

        # Build the RAGAS metric
        metric = SUPPORTED_METRICS[score_name](score_params or {})

        # Build sample — infer single-turn vs multi-turn from data
        try:
            if _is_multi_turn(input, output):
                sample: SingleTurnSample | MultiTurnSample = _build_multi_turn_sample(input, output, expected)
            else:
                sample = _build_single_turn_sample(input, output, expected)
        except Exception as e:
            logger.exception("Failed to parse test case for metric '%s'", score_name)
            return ScoreResult(error=f"Failed to parse test case: {e}")

        # Get LLM and embeddings clients
        llm, embeddings = self._get_clients(p.model_id, p.embeddings_id, p.model_args)

        # Run RAGAS evaluation for this single metric
        try:
            dataset = EvaluationDataset(samples=[sample])
            ragas_result = ragas.evaluate(
                dataset,
                metrics=[metric],
                llm=llm,
                embeddings=embeddings,
                return_executor=False,
            )
        except Exception as e:
            logger.exception("RAGAS evaluation failed for metric '%s'", score_name)
            return ScoreResult(error=f"RAGAS evaluation failed: {e}")

        # Extract the value from the scores dict (avoids pandas conversion)
        scores_row = ragas_result.scores[0] if ragas_result.scores else {}  # type: ignore[union-attr]

        # RAGAS appends "(mode=X)" for ModeMetric subclasses (e.g. TopicAdherenceScore)
        col_name = score_name
        if hasattr(metric, "mode"):
            col_name = f"{score_name}(mode={metric.mode})"

        value = scores_row.get(col_name)

        if value is None or (isinstance(value, float) and math.isnan(value)):
            return ScoreResult(error=f"Metric '{score_name}' returned NaN")

        return ScoreResult(value=float(value))

    def _get_clients(
        self, model_id: str, embeddings_id: str, model_args: dict[str, Any] | None
    ) -> tuple[ChatBedrock, BedrockEmbeddings]:
        if (
            self._llm is not None
            and self._embeddings is not None
            and self._current_model_id == model_id
            and self._current_embeddings_id == embeddings_id
            and self._current_model_args == model_args
        ):
            return self._llm, self._embeddings

        # Lazy import to keep gateway_client optional at import time
        from evaluator_sdk.gateway_client import (
            get_gateway_bedrock_client,
            get_gateway_model_id,
            is_gateway_configured,
        )

        if is_gateway_configured():
            # Route LLM through AI Gateway (embeddings still go direct — gateway is chat-only)
            self._llm = ChatBedrock(
                model=get_gateway_model_id(),
                model_kwargs=model_args,
                client=get_gateway_bedrock_client(),
            )
        else:
            self._llm = ChatBedrock(model=model_id, model_kwargs=model_args, config=boto3_config())
        self._embeddings = BedrockEmbeddings(model_id=embeddings_id, config=boto3_config())
        self._current_model_id = model_id
        self._current_embeddings_id = embeddings_id
        self._current_model_args = model_args
        return self._llm, self._embeddings


DEFAULT_MODEL_ID = "amazon.nova-micro-v1:0"
DEFAULT_EMBEDDINGS_ID = "amazon.titan-embed-text-v2:0"


class RagasParams(BaseModel):
    model_id: str = DEFAULT_MODEL_ID
    embeddings_id: str = DEFAULT_EMBEDDINGS_ID
    model_args: dict[str, Any] | None = None


SUPPORTED_METRICS: dict[str, Any] = {
    "answer_relevancy": lambda config: AnswerRelevancy(name="answer_relevancy", **config),
    "answer_accuracy": lambda config: AnswerAccuracy(name="answer_accuracy", **config),
    "response_groundedness": lambda config: ResponseGroundedness(name="response_groundedness", **config),
    "faithfulness": lambda config: Faithfulness(name="faithfulness", **config),
    "context_relevancy": lambda config: ContextRelevance(name="context_relevancy", **config),
    "context_precision": lambda config: LLMContextPrecisionWithoutReference(name="context_precision", **config),
    "context_recall": lambda config: ContextRecall(name="context_recall", **config),
    "topic_adherence": lambda config: TopicAdherenceScore(name="topic_adherence", **config),
    "tool_call_accuracy": lambda config: ToolCallAccuracy(name="tool_call_accuracy", **config),
    "agent_goal_accuracy": lambda config: AgentGoalAccuracyWithoutReference(name="agent_goal_accuracy", **config),
    "agent_goal_accuracy_with_reference": lambda config: AgentGoalAccuracyWithReference(
        name="agent_goal_accuracy_with_reference", **config
    ),
}


class MessageType(str, Enum):
    HUMAN = "human"
    AI = "ai"
    TOOL = "tool"


class MultiTurnMessage(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=alias_generators.to_camel)

    type: MessageType
    content: str
    tool_calls: list[ToolCall] | None = None


def _is_multi_turn(input_data: Any, output: Any) -> bool:
    """Infer multi-turn from the presence of messages in input or output."""
    return (
        (isinstance(input_data, dict) and "messages" in input_data)
        or (isinstance(output, dict) and "messages" in output)
    )


def _build_single_turn_sample(input_data: Any, output: Any, expected: dict[str, Any] | None) -> SingleTurnSample:
    """Build a SingleTurnSample from input/output/expected.

    Expected field locations:
    - input: user_input, retrieved_contexts (optional)
    - output: response, retrieved_contexts (optional, fallback)
    - expected: reference
    """
    input_data = input_data if isinstance(input_data, dict) else {}
    output = output if isinstance(output, dict) else {}
    expected = expected or {}

    return SingleTurnSample(
        user_input=input_data.get("user_input", ""),
        retrieved_contexts=input_data.get("retrieved_contexts", output.get("retrieved_contexts", [])),
        response=output.get("response", ""),
        reference=expected.get("reference", ""),
    )


def _build_multi_turn_sample(input_data: Any, output: Any, expected: dict[str, Any] | None) -> MultiTurnSample:
    """Build a MultiTurnSample from input/output/expected.

    Expected field locations:
    - input: messages (prior turns)
    - output: messages (AI response turns)
    - expected: reference, reference_tool_calls, reference_topics
    """
    input_data = input_data if isinstance(input_data, dict) else {}
    output = output if isinstance(output, dict) else {}
    expected = expected or {}

    input_messages = _parse_messages(input_data.get("messages", []))
    output_messages = _parse_messages(output.get("messages", []))

    # Support both RAGAS field name (reference_tool_calls) and testcase created via GTG plugin
    raw_tool_calls = expected.get("reference_tool_calls") or expected.get("toolCalls", [])
    if raw_tool_calls and not isinstance(raw_tool_calls, list):
        raise TypeError(
            f"reference_tool_calls/toolCalls must be a list, got {type(raw_tool_calls).__name__}. "
            "Check your testcase data format."
        )
    if raw_tool_calls and isinstance(raw_tool_calls[0], list):
        raw_tool_calls = [tc for turn in raw_tool_calls for tc in turn]
    reference_tool_calls = [ToolCall.model_validate(tc) for tc in raw_tool_calls]

    return MultiTurnSample(
        user_input=input_messages + output_messages,
        reference=expected.get("reference"),
        reference_tool_calls=reference_tool_calls,
        reference_topics=expected.get("reference_topics"),
    )


def _parse_messages(raw_messages: list[dict[str, Any]]) -> list[HumanMessage | AIMessage | ToolMessage]:
    messages: list[HumanMessage | AIMessage | ToolMessage] = []
    for msg in raw_messages:
        parsed = MultiTurnMessage.model_validate(msg)
        if parsed.type == MessageType.HUMAN:
            messages.append(HumanMessage(content=parsed.content))
        elif parsed.type == MessageType.AI:
            messages.append(AIMessage(content=parsed.content, tool_calls=parsed.tool_calls))
        elif parsed.type == MessageType.TOOL:
            messages.append(ToolMessage(content=parsed.content))
    return messages


RagasScorer.available_scores = dict.fromkeys(SUPPORTED_METRICS)
