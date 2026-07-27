"""Evaluator SDK for building custom evaluators."""

from awssolutions_gen_ai_evaluation_toolkit_python_client.models import (  # type: ignore[attr-defined]
    InlineTestCase,
)

from evaluator_sdk.evaluator import EtkClient, Evaluator
from evaluator_sdk.gateway_client import (
    get_gateway_bedrock_client,
    get_gateway_model_id,
    is_gateway_configured,
)
from evaluator_sdk.log_context import (
    JsonFormatter,
    clear_job_context,
    configure_json_logging,
    job_log_context,
    set_job_context,
)
from evaluator_sdk.models import (
    AppInvokeFn,
    EvaluationResponse,
    EvaluationResult,
    EvaluatorError,
    ExpectedType,
    InputType,
    MetadataType,
    OutputType,
    ScoreResult,
    ScorerFn,
    TestCase,
    TestResult,
)
from evaluator_sdk.scorer import Scorer, scorer

__all__ = [
    "EtkClient",
    "Evaluator",
    "EvaluationResponse",
    "EvaluationResult",
    "EvaluatorError",
    "InlineTestCase",
    "TestCase",
    "TestResult",
    "ScoreResult",
    "AppInvokeFn",
    "Scorer",
    "ScorerFn",
    "scorer",
    "InputType",
    "OutputType",
    "ExpectedType",
    "MetadataType",
    "job_log_context",
    "set_job_context",
    "clear_job_context",
    "configure_json_logging",
    "JsonFormatter",
    "get_gateway_bedrock_client",
    "get_gateway_model_id",
    "is_gateway_configured",
]

__version__ = "2.0.0"
