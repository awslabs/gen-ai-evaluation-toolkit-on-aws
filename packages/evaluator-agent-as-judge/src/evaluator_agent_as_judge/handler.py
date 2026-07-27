"""Lambda handler for the agent-as-judge evaluator.

Runs assert_no_internet_egress() at cold start before instantiating the
Evaluator. If the runtime can reach the public internet (drift from the
expected isolated-subnet deployment), the import fails loudly and the Lambda
refuses to serve any invocation.

This evaluator does NOT support app_invoke. The Lambda runs in isolated
subnets with no internet egress and cannot reach any external application.
app_invoke is intentionally omitted — if the SDK receives an APP_INVOKE or
FULL job type it will raise EvaluatorError immediately, making the constraint
explicit rather than silently timing out.
"""

import logging
import os

from evaluator_sdk import Evaluator
from evaluator_sdk.log_context import configure_json_logging

from evaluator_agent_as_judge.network_guard import assert_no_internet_egress
from evaluator_agent_as_judge.scorers.agent_as_judge import AgentAsJudgeScorer

_SERVICE_NAME = os.environ.get("POWERTOOLS_SERVICE_NAME", "evaluator-agent-as-judge")
_AWS_REGION = os.environ.get("AWS_REGION", "us-east-1")
_EVALUATOR_NAME = os.environ.get("EVALUATOR_NAME", "agent-as-judge")
_API_ENDPOINT = os.environ.get("ETK_API_ENDPOINT")

configure_json_logging(service=_SERVICE_NAME)
logger = logging.getLogger(__name__)

# Defence-in-depth: prove we're isolated before doing anything else.
# Module-load (cold start) is the right place — if drift happens, every
# subsequent invocation in this container fails fast on import.
assert_no_internet_egress()

evaluator = Evaluator(
    name=_EVALUATOR_NAME,
    api_endpoint=_API_ENDPOINT,
    region=_AWS_REGION,
    # app_invoke is deliberately not registered — see module docstring.
    scorers=[AgentAsJudgeScorer],
)

lambda_handler = evaluator.evaluator_handler
