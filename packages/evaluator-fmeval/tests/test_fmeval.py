"""Unit tests for the FMEval scorer."""

from unittest.mock import MagicMock, patch

from evaluator_sdk import Evaluator, ScoreResult

from evaluator_fmeval.scorer import (
    SUPPORTED_ALGORITHMS,
    FMEvalScorer,
)


def _make_evaluator() -> Evaluator:
    return Evaluator(
        name="test-fmeval",
        scorers=[FMEvalScorer],
        local_only=True,
    )


class TestFMEvalScorer:
    def test_name(self) -> None:
        assert FMEvalScorer().name == "fmeval"

    def test_available_scores_lists_all_algorithms(self) -> None:
        for name in SUPPORTED_ALGORITHMS:
            assert name in FMEvalScorer.available_scores

    def test_empty_scores_dict_returns_empty(self) -> None:
        evaluator = _make_evaluator()
        resp = evaluator.score(
            testcases=[{"input": {"model_input": "hi"}, "output": {"model_output": "hello"}}],
            scorers={"fmeval": {"scores": {}}},
        )
        assert len(resp.results) == 1
        assert all("fmeval" not in k for k in resp.results[0].scores)

    def test_unknown_algorithm_returns_error(self) -> None:
        evaluator = _make_evaluator()
        resp = evaluator.score(
            testcases=[{"input": {"model_input": "hi"}, "output": {"model_output": "hello"}}],
            scorers={"fmeval": {"scores": {"nonexistent_algo": None}}},
        )
        sr = resp.results[0].scores["fmeval.nonexistent_algo"]
        assert isinstance(sr, ScoreResult)
        assert sr.error is not None
        assert "Unknown FMEval algorithm" in sr.error

    @patch("evaluator_fmeval.scorer.get_eval_algorithm")
    def test_successful_single_score(self, mock_get_algo: MagicMock) -> None:
        mock_eval_score = MagicMock()
        mock_eval_score.name = "toxicity"
        mock_eval_score.value = 0.05

        mock_eval_output = MagicMock()
        mock_eval_output.dataset_scores = [mock_eval_score]

        mock_evaluator = MagicMock()
        mock_evaluator.evaluate.return_value = [mock_eval_output]
        mock_get_algo.return_value = mock_evaluator

        evaluator = _make_evaluator()
        resp = evaluator.score(
            testcases=[{
                "input": {"model_input": "What is AI?"},
                "output": {"model_output": "AI is artificial intelligence."},
            }],
            scorers={"fmeval": {"scores": {"toxicity": None}}},
        )

        assert resp.results[0].scores["fmeval.toxicity"].value == 0.05
        mock_get_algo.assert_called_once_with("toxicity", {})

    @patch("evaluator_fmeval.scorer.get_eval_algorithm")
    def test_multiple_scores_from_single_algo(self, mock_get_algo: MagicMock) -> None:
        mock_score1 = MagicMock()
        mock_score1.name = "sub_score_a"
        mock_score1.value = 0.8

        mock_score2 = MagicMock()
        mock_score2.name = "sub_score_b"
        mock_score2.value = 0.6

        mock_eval_output = MagicMock()
        mock_eval_output.dataset_scores = [mock_score1, mock_score2]

        mock_evaluator = MagicMock()
        mock_evaluator.evaluate.return_value = [mock_eval_output]
        mock_get_algo.return_value = mock_evaluator

        evaluator = _make_evaluator()
        resp = evaluator.score(
            testcases=[{"input": {"model_input": "test"}, "output": {"model_output": "test"}}],
            scorers={"fmeval": {"scores": {"toxicity": None}}},
        )

        scores = resp.results[0].scores
        assert scores["fmeval.toxicity.sub_score_a"].value == 0.8
        assert scores["fmeval.toxicity.sub_score_b"].value == 0.6

    @patch("evaluator_fmeval.scorer.get_eval_algorithm")
    def test_algo_params_forwarded(self, mock_get_algo: MagicMock) -> None:
        mock_eval_score = MagicMock()
        mock_eval_score.name = "toxicity"
        mock_eval_score.value = 0.0
        mock_eval_output = MagicMock()
        mock_eval_output.dataset_scores = [mock_eval_score]
        mock_evaluator = MagicMock()
        mock_evaluator.evaluate.return_value = [mock_eval_output]
        mock_get_algo.return_value = mock_evaluator

        evaluator = _make_evaluator()
        evaluator.score(
            testcases=[{"input": {"model_input": "test"}, "output": {"model_output": "test"}}],
            scorers={"fmeval": {"scores": {"toxicity": {"some_param": "value"}}}},
        )

        mock_get_algo.assert_called_once_with("toxicity", {"some_param": "value"})

    @patch("evaluator_fmeval.scorer.get_eval_algorithm")
    def test_algorithm_load_failure(self, mock_get_algo: MagicMock) -> None:
        mock_get_algo.side_effect = Exception("Algorithm not found")

        evaluator = _make_evaluator()
        resp = evaluator.score(
            testcases=[{"input": {"model_input": "test"}, "output": {"model_output": "test"}}],
            scorers={"fmeval": {"scores": {"toxicity": None}}},
        )

        sr = resp.results[0].scores["fmeval.toxicity"]
        assert isinstance(sr, ScoreResult)
        assert sr.error is not None
        assert "Failed to load algorithm" in sr.error

    @patch("evaluator_fmeval.scorer.get_eval_algorithm")
    def test_evaluation_failure(self, mock_get_algo: MagicMock) -> None:
        mock_evaluator = MagicMock()
        mock_evaluator.evaluate.side_effect = Exception("Evaluation crashed")
        mock_get_algo.return_value = mock_evaluator

        evaluator = _make_evaluator()
        resp = evaluator.score(
            testcases=[{"input": {"model_input": "test"}, "output": {"model_output": "test"}}],
            scorers={"fmeval": {"scores": {"toxicity": None}}},
        )

        sr = resp.results[0].scores["fmeval.toxicity"]
        assert isinstance(sr, ScoreResult)
        assert sr.error is not None
        assert "FMEval evaluation failed" in sr.error

    @patch("evaluator_fmeval.scorer.get_eval_algorithm")
    def test_empty_eval_output(self, mock_get_algo: MagicMock) -> None:
        mock_eval_output = MagicMock()
        mock_eval_output.dataset_scores = []
        mock_evaluator = MagicMock()
        mock_evaluator.evaluate.return_value = [mock_eval_output]
        mock_get_algo.return_value = mock_evaluator

        evaluator = _make_evaluator()
        resp = evaluator.score(
            testcases=[{"input": {"model_input": "test"}, "output": {"model_output": "test"}}],
            scorers={"fmeval": {"scores": {"toxicity": None}}},
        )

        sr = resp.results[0].scores["fmeval.toxicity"]
        assert isinstance(sr, ScoreResult)
        assert sr.error is not None
        assert "returned no scores" in sr.error

    @patch("evaluator_fmeval.scorer.get_eval_algorithm")
    def test_with_expected(self, mock_get_algo: MagicMock) -> None:
        mock_eval_score = MagicMock()
        mock_eval_score.name = "qa_accuracy"
        mock_eval_score.value = 0.9
        mock_eval_output = MagicMock()
        mock_eval_output.dataset_scores = [mock_eval_score]
        mock_evaluator = MagicMock()
        mock_evaluator.evaluate.return_value = [mock_eval_output]
        mock_get_algo.return_value = mock_evaluator

        evaluator = _make_evaluator()
        resp = evaluator.score(
            testcases=[{
                "input": {"model_input": "What is X?"},
                "output": {"model_output": "X is a thing."},
                "expected": {"target_output": "X is a concept."},
            }],
            scorers={"fmeval": {"scores": {"qa_accuracy": None}}},
        )

        assert resp.results[0].scores["fmeval.qa_accuracy"].value == 0.9


class TestSupportedAlgorithms:
    def test_expected_algorithms_present(self) -> None:
        expected = [
            "factual_knowledge",
            "toxicity",
            "qa_toxicity",
            "summarization_toxicity",
            "qa_accuracy",
            "summarization_accuracy",
            "classification_accuracy",
        ]
        for name in expected:
            assert name in SUPPORTED_ALGORITHMS
