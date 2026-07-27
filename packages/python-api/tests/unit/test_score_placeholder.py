"""Unit tests for score name → DDB placeholder encoding.

The encoding must be collision-free so that concurrent workers produce
the same placeholder for a given score name, and different names never
map to the same placeholder.
"""

import re

import pytest

from evaluator_api.ddb import encode_score_placeholder


@pytest.mark.parametrize(
    "name, expected",
    [
        ("accuracy", "accuracy"),
        ("QualityScorer.relevance", "QualityScorer_drelevance"),
        ("exact_match", "exact_umatch"),
        ("My_Scorer.sub_score", "My_uScorer_dsub_uscore"),
        ("a.b.c", "a_db_dc"),
        ("a__b", "a_u_ub"),
        ("a._b", "a_d_ub"),
        ("a_.b", "a_u_db"),
        (".", "_d"),
        ("_", "_u"),
        ("", ""),
    ],
)
def test_encode(name: str, expected: str) -> None:
    assert encode_score_placeholder(name) == expected


def test_no_collisions() -> None:
    """Names that would collide under naive replacement must not collide."""
    names = [
        "my.score",
        "my_score",
        "exact.match",
        "exact_dot_match",
        "a_b",
        "a.b",
        "a._b",
        "a_.b",
    ]
    encoded = [encode_score_placeholder(n) for n in names]
    assert len(set(encoded)) == len(names), f"Collision: {dict(zip(names, encoded, strict=True))}"


def test_output_is_ddb_safe() -> None:
    """Encoded placeholders must only contain [A-Za-z0-9_]."""
    names = ["QualityScorer.relevance", "exact_match", "a.b.c", "_._"]
    pattern = re.compile(r"^[A-Za-z0-9_]*$")
    for name in names:
        encoded = encode_score_placeholder(name)
        assert pattern.match(encoded), f"Invalid chars in {encoded!r} (from {name!r})"


def test_deterministic() -> None:
    """Same name always produces the same placeholder (concurrent worker safety)."""
    name = "QualityScorer.relevance"
    assert encode_score_placeholder(name) == encode_score_placeholder(name)
