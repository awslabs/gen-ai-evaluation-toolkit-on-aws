"""Agent-as-Judge scorer — opencode-driven evaluation.

Produces one score per user-defined evaluator. Evaluators are passed via
``params`` (shared across all scores for a test case). Each score name must
match the name of an evaluator in ``params.evaluators``.

Supports both built-in evaluators (referenced by name via ``BuiltInEvaluator``)
and fully custom evaluators (user-supplied ``Evaluator`` with description and
optional config/output_schema).
"""

import logging
import shutil
from typing import Any, List

from evaluator_sdk import Scorer, ScoreResult, TestResult, scorer
from pydantic import ValidationError

from evaluator_agent_as_judge.helpers import download_artifacts, download_requirements
from evaluator_agent_as_judge.models import (
    AgentAsJudgeParams,
    BuiltInEvaluator,
    EvaluationContext,
    Evaluator,
    S3Ref,
)
from evaluator_agent_as_judge.runner import run_evaluator

logger = logging.getLogger(__name__)


class AgentAsJudgeScorer(Scorer):
    """Scorer that delegates judging to an opencode subprocess.

    Each score in the ``scores`` dict must be the name of an evaluator
    defined in ``params.evaluators``. The scorer:

    1. Downloads requirement docs (per evaluator) and artifacts
       (per test case) from S3.
    2. Spawns opencode for each evaluator with a prompt built from the
       test case input/output/context, the artifact dirs, and the
       requirement doc dir.
    3. Returns the verdict score from the opencode subprocess.

    Requirement docs and artifacts are downloaded fresh into per-call
    temp directories and removed after each score call, so nothing leaks
    across warm Lambda invocations (each run sees only its own files).
    """

    name = "agent_as_judge"

    @scorer(dynamic=True)
    def _evaluator_scorer(
        self,
        score_name: str,
        score_params: dict[str, Any] | None,
        test_result: TestResult,
        params: dict[str, Any] | None = None,
    ) -> ScoreResult:
        # Validate top-level params (carries the evaluator definitions list).
        try:
            config = AgentAsJudgeParams.model_validate(params or {})
        except ValidationError as err:
            return ScoreResult(error=f"Invalid agent-as-judge params: {err}")

        assert score_params is not None, "Score params are required"

        # Resolve the evaluator definition for this score name.
        try:
            evaluator = self._resolve_evaluator(score_name, score_params)
        except KeyError as err:
            return ScoreResult(error=str(err))

        # Download per-evaluator requirement docs into a fresh temp dir.
        req_dir = download_requirements(evaluator)
        artifact_dirs: list[str] = []

        try:
            # Build the test case from the SDK-supplied fields.
            artifacts: List[S3Ref] = []
            try:
                if test_result.context is not None:
                    context = EvaluationContext.model_validate(test_result.context)
                    artifacts = context.artifacts or []

                    # Remove artifacts from test result so it's not passed to the agent later on
                    test_result.context.pop("artifacts", None)
            except ValidationError as err:
                return ScoreResult(error=str(err))

            # Download per-test-case artifacts.
            artifact_dirs = download_artifacts(artifacts)

            verdict_score, _ = run_evaluator(
                config=config,
                evaluator=evaluator,
                test_case=test_result,
                artifact_dirs=artifact_dirs,
                requirement_doc_dir=req_dir,
            )
            return verdict_score
        finally:
            for d in artifact_dirs:
                shutil.rmtree(d, ignore_errors=True)
            if req_dir is not None:
                shutil.rmtree(req_dir, ignore_errors=True)

    # ---- helpers ----

    def _resolve_evaluator(self, score_name: str, score_params: dict[str, Any]) -> Evaluator:
        if "builtIn" in score_params or "built_in" in score_params:
            return BuiltInEvaluator(**score_params).to_evaluator()

        return Evaluator(name=score_name, **score_params)
