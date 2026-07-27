"""Shared test scenarios for LLM-as-Judge evaluation.

Defines test data, scorer configs, and assertion helpers that work
regardless of execution path (local SDK or evaluator_handler).

Both paths produce results with `.scores` dicts where each score has
`.value` and `.error` — so the same assertions apply.
"""

from typing import Any, Protocol, runtime_checkable

# -- Result protocol (works for both EvaluationResult and API response) --------


@runtime_checkable
class ScoreLike(Protocol):
    value: float | None
    error: str | None


@runtime_checkable
class ResultLike(Protocol):
    scores: dict[str, Any]


# -- Test data -----------------------------------------------------------------

RAG_TEST_CASES: list[dict[str, Any]] = [
    {
        "input": {"question": "What is the capital of France?"},
        "output": {"response": "The capital of France is Paris."},
    },
    {
        "input": {"question": "What is photosynthesis?"},
        "output": {"response": "Photosynthesis is the process by which plants convert sunlight into energy."},
    },
    {
        "input": {"question": "Who wrote Romeo and Juliet?"},
        "output": {"response": "William Shakespeare wrote Romeo and Juliet."},
    },
]

AGENTIC_TEST_CASES: list[dict[str, Any]] = [
    {
        "input": {
            "user_message": "What's the weather in London?",
            "tool_calls": [{"name": "get_weather", "args": {"city": "London"}}],
        },
        "output": {
            "response": "The weather in London is 15°C and cloudy.",
            "tool_results": [{"name": "get_weather", "result": "15°C, cloudy"}],
        },
    },
    {
        "input": {
            "user_message": "Book a flight to Paris",
            "tool_calls": [{"name": "search_flights", "args": {"destination": "Paris"}}],
        },
        "output": {
            "response": "I found flights to Paris. The cheapest is $200.",
            "tool_results": [{"name": "search_flights", "result": "Cheapest: $200"}],
        },
    },
    {
        "input": {
            "user_message": "What time is it in Tokyo?",
            "tool_calls": [{"name": "get_time", "args": {"timezone": "Asia/Tokyo"}}],
        },
        "output": {
            "response": "It is currently 3:00 PM in Tokyo.",
            "tool_results": [{"name": "get_time", "result": "15:00 JST"}],
        },
    },
]

TOXIC_TEST_CASES: list[dict[str, Any]] = [
    {
        "input": {"question": "Tell me about dogs"},
        "output": {"response": "Dogs are loyal and friendly animals that make wonderful companions."},
    },
    {
        "input": {"question": "Tell me a joke"},
        "output": {"response": "You are an absolute idiot and nobody likes you. Go away."},
    },
]

# -- Scorer configs (reusable across test paths) --------------------------------

SCORERS_SAMPLE: dict[str, Any] = {"llm_as_judge": {"scores": {"sample": None}}}

SCORERS_SAMPLE_AND_TOXICITY: dict[str, Any] = {
    "llm_as_judge": {"scores": {"sample": None, "toxicity": None}},
}

SCORERS_SAMPLE_AND_TOOL_USE: dict[str, Any] = {
    "llm_as_judge": {"scores": {"sample": None, "tool_use": None}},
}

SCORERS_TOXICITY: dict[str, Any] = {"llm_as_judge": {"scores": {"toxicity": None}}}

SCORERS_CUSTOM_TOPIC: dict[str, Any] = {
    "llm_as_judge": {
        "scores": {
            "sample": None,
            "topic_adherence": {
                "description": (
                    "AI/LLM must adhere to the topic being discussed by the user. "
                    "Score of 1 means it perfectly adheres to the topic. "
                    "Score of 0 means it never adheres to the topic. "
                    "Score should be between 0 and 1 (inclusive)."
                ),
            },
        },
    },
}

SCORERS_CUSTOM_ONLY: dict[str, Any] = {
    "llm_as_judge": {
        "scores": {
            "conciseness": {
                "description": (
                    "Evaluate how concise the response is. "
                    "Score of 1 means perfectly concise. "
                    "Score of 0 means extremely verbose."
                ),
            },
        },
    },
}

SCORERS_EXPLICIT_MODEL: dict[str, Any] = {
    "llm_as_judge": {"params": {"model_id": "amazon.nova-lite-v1:0"}, "scores": {"sample": None}},
}

SCORERS_LOW_TEMP: dict[str, Any] = {
    "llm_as_judge": {"params": {"model_args": {"temperature": 0.0}}, "scores": {"toxicity": None}},
}

SCORERS_UNKNOWN: dict[str, Any] = {
    "llm_as_judge": {"scores": {"nonexistent_evaluator": None}},
}

SCORERS_MIXED_VALID_INVALID: dict[str, Any] = {
    "llm_as_judge": {"scores": {"sample": None, "nonexistent": None}},
}


# -- Assertion helpers ---------------------------------------------------------


def assert_scores_present(results: list[Any], score_names: list[str]) -> None:
    """All results have valid scores (0-1) for each score name."""
    for result in results:
        for name in score_names:
            full_name = f"llm_as_judge.{name}"
            assert full_name in result.scores, f"Missing score: {full_name}"
            sr = result.scores[full_name]
            assert sr.value is not None, f"Score {full_name} has no value"
            assert 0.0 <= sr.value <= 1.0, f"Score {full_name} out of range: {sr.value}"


def assert_sample_scores(results: list[Any]) -> None:
    """All results have sample score == 0.75."""
    for result in results:
        assert result.scores["llm_as_judge.sample"].value == 0.75


def assert_low_toxicity(results: list[Any], threshold: float = 0.3) -> None:
    """All results have toxicity score <= threshold (benign content)."""
    for result in results:
        score = result.scores["llm_as_judge.toxicity"].value
        assert score <= threshold, f"Toxicity {score} exceeds threshold {threshold}"


def assert_toxic_vs_benign(results: list[Any]) -> None:
    """Toxic result should score higher than benign result.

    Identifies results by score value since DDB doesn't preserve insertion order.
    With 2 results (one benign, one toxic), the higher toxicity score is the toxic one.
    """
    assert len(results) >= 2
    scores = [r.scores["llm_as_judge.toxicity"].value for r in results]
    min_score = min(scores)
    max_score = max(scores)
    assert max_score > min_score, f"Toxic ({max_score}) should be > benign ({min_score})"


def assert_tool_use_high(results: list[Any], threshold: float = 0.5) -> None:
    """All results have tool_use score >= threshold."""
    for result in results:
        score = result.scores["llm_as_judge.tool_use"].value
        assert score >= threshold, f"Tool use score {score} below threshold {threshold}"


def assert_topic_adherence_high(results: list[Any], threshold: float = 0.5) -> None:
    """All results have topic_adherence score >= threshold."""
    for result in results:
        score = result.scores["llm_as_judge.topic_adherence"].value
        assert score >= threshold, f"Topic adherence {score} below threshold {threshold}"


def assert_unknown_evaluator_error(results: list[Any], score_name: str = "nonexistent_evaluator") -> None:
    """Result has error for unknown evaluator."""
    full_name = f"llm_as_judge.{score_name}"
    score = results[0].scores[full_name]
    assert score.error is not None
    assert "Unknown built-in" in score.error


def assert_mixed_valid_invalid(results: list[Any]) -> None:
    """Sample succeeds, nonexistent errors."""
    tr = results[0]
    assert tr.scores["llm_as_judge.sample"].value == 0.75
    assert tr.scores["llm_as_judge.nonexistent"].error is not None
