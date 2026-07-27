"""Lambda handler for the built-in evaluator.

Creates an Evaluator instance at module level (cold start) with a Bedrock-based
app_invoke and all built-in scorers registered. The Lambda handler is the
Evaluator's evaluator_handler method, which processes EventBridge events for
FULL, APP_INVOKE, and SCORE jobs.
"""

import logging
import os

from evaluator_sdk import Evaluator
from evaluator_sdk.log_context import configure_json_logging

from evaluator_builtin.app_invoke import bedrock_converse_app_invoke
from evaluator_builtin.scorers.agentcore import AgentCoreScorer
from evaluator_builtin.scorers.deepeval import DeepEvalScorer
from evaluator_builtin.scorers.llm_as_judge import LlmAsJudgeScorer
from evaluator_builtin.scorers.ragas import RagasScorer

_SERVICE_NAME = os.environ.get("POWERTOOLS_SERVICE_NAME", "evaluator-builtin")
_AWS_REGION = os.environ.get("AWS_REGION", "us-east-1")
_EVALUATOR_NAME = os.environ.get("EVALUATOR_NAME", "builtin")
_API_ENDPOINT = os.environ.get("ETK_API_ENDPOINT")

configure_json_logging(service=_SERVICE_NAME)
logger = logging.getLogger(__name__)

evaluator = Evaluator(
    name=_EVALUATOR_NAME,
    api_endpoint=_API_ENDPOINT,
    region=_AWS_REGION,
    app_invoke=bedrock_converse_app_invoke,
    scorers=[LlmAsJudgeScorer, RagasScorer, AgentCoreScorer, DeepEvalScorer],
)

lambda_handler = evaluator.evaluator_handler
