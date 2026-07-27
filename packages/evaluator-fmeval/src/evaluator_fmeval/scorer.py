"""FMEval scorer — evaluates foundation models using Amazon's FMEval library."""

import json
import logging
import tempfile
from pathlib import Path
from typing import Any

from evaluator_sdk import Scorer, ScoreResult, TestResult, scorer
from fmeval.data_loaders.data_config import DataConfig
from fmeval.eval import get_eval_algorithm
from fmeval.eval_algorithms.eval_algorithm import EvalOutput

logger = logging.getLogger(__name__)

SUPPORTED_ALGORITHMS = [
    "factual_knowledge",
    "toxicity",
    "qa_toxicity",
    "summarization_toxicity",
    "qa_accuracy",
    "summarization_accuracy",
    "classification_accuracy",
]


class FMEvalScorer(Scorer):
    """Scorer that evaluates foundation models using Amazon's FMEval library.

    Each score in the ``scores`` dict represents an FMEval evaluation algorithm:

    Supported algorithms:
    - ``factual_knowledge``, ``toxicity``, ``qa_toxicity``,
      ``summarization_toxicity``, ``qa_accuracy``, ``summarization_accuracy``,
      ``classification_accuracy``

    Test case field locations:
    - ``input``: ``model_input`` — the model input/prompt
    - ``output``: ``model_output`` — the model's response
    - ``expected``: ``target_output`` — the expected/reference output (optional)

    Example usage::

        evaluator = Evaluator(
            scorers=[FMEvalScorer],
            local_only=True,
        )
        response = evaluator.score(
            testcases=[
                {
                    "input": {"model_input": "What is the capital of France?"},
                    "output": {"model_output": "The capital of France is Paris."},
                    "expected": {"target_output": "Paris"},
                }
            ],
            scorers={
                "fmeval": {
                    "scores": {
                        "toxicity": None,
                        "qa_accuracy": None,
                    },
                }
            },
        )
    """

    name = "fmeval"
    available_scores = dict.fromkeys(SUPPORTED_ALGORITHMS)

    @scorer(dynamic=True)
    def _evaluate_algorithm(
        self,
        score_name: str,
        score_params: dict[str, Any] | None,
        test_result: TestResult,
        params: dict[str, Any] | None = None,
    ) -> ScoreResult | dict[str, float | ScoreResult]:
        if score_name not in SUPPORTED_ALGORITHMS:
            return ScoreResult(
                error=f"Unknown FMEval algorithm '{score_name}'. Available: {SUPPORTED_ALGORITHMS}"
            )

        input = test_result.input
        output = test_result.output
        expected = test_result.expected

        # Load the algorithm
        try:
            algo_params = score_params or {}
            evaluator = get_eval_algorithm(score_name, algo_params)
        except Exception as e:
            logger.exception("Failed to load algorithm '%s'", score_name)
            return ScoreResult(error=f"Failed to load algorithm '{score_name}': {e}")

        # Build the JSONL row using fixed field names
        input_data = input if isinstance(input, dict) else {}
        output_data = output if isinstance(output, dict) else {}
        expected = expected or {}

        row: dict[str, Any] = {
            "model_input": input_data.get("model_input", ""),
            "model_output": output_data.get("model_output", ""),
        }
        target = expected.get("target_output")
        if target is not None:
            row["target_output"] = target

        # Run evaluation
        try:
            eval_outputs = self._run_evaluation(evaluator, row)
            return self._extract_scores(score_name, eval_outputs)
        except Exception as e:
            logger.exception("FMEval evaluation failed for '%s'", score_name)
            return ScoreResult(error=f"FMEval evaluation failed for '{score_name}': {e}")

    @staticmethod
    def _run_evaluation(evaluator: Any, row: dict[str, Any]) -> list[EvalOutput]:
        """Write testcase to a temp JSONL file and run fmeval evaluation."""
        with tempfile.TemporaryDirectory() as tmpdir:
            dataset_path = Path(tmpdir) / "dataset.jsonl"
            dataset_path.write_text(json.dumps(row) + "\n")

            data_config = DataConfig(
                dataset_name="single_testcase",
                dataset_uri=str(dataset_path),
                dataset_mime_type="application/jsonlines",
                model_input_location="model_input",
                model_output_location="model_output",
                target_output_location="target_output",
            )

            return evaluator.evaluate(dataset_config=data_config)  # type: ignore[no-any-return]

    @staticmethod
    def _extract_scores(
        algo_name: str, eval_outputs: list[EvalOutput]
    ) -> ScoreResult | dict[str, float | ScoreResult]:
        """Extract scores from fmeval EvalOutput objects.

        Single-score algorithms return a ScoreResult directly.
        Multi-score algorithms return a dict with "{algo_name}.{score_name}" keys.
        """
        all_scores: list[tuple[str, float]] = []
        for eval_output in eval_outputs:
            for eval_score in eval_output.dataset_scores:
                all_scores.append((eval_score.name, eval_score.value))

        if not all_scores:
            return ScoreResult(error=f"Algorithm '{algo_name}' returned no scores")

        if len(all_scores) == 1:
            return ScoreResult(value=float(all_scores[0][1]))

        return {
            f"{algo_name}.{name}": ScoreResult(value=float(value))
            for name, value in all_scores
        }
