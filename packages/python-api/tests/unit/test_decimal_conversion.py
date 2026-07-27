"""Unit tests for Decimal<->float conversion at the DynamoDB boundary.

DynamoDB requires floats stored as Decimal; callers expect plain floats back.
`floats_to_decimal` is applied on write and `decimals_to_float` on read, so
nested numeric data (e.g. agent-as-judge per-requirement scores in a score's
`context`) round-trips without leaking Decimal objects into API responses.
"""

from decimal import Decimal

from evaluator_api.ddb.common import decimals_to_float, floats_to_decimal
from evaluator_api.ddb.models import ScoreItemModel


class TestFloatsToDecimal:
    def test_top_level_float(self) -> None:
        assert floats_to_decimal(0.5) == Decimal("0.5")

    def test_non_floats_untouched(self) -> None:
        assert floats_to_decimal("x") == "x"
        assert floats_to_decimal(3) == 3
        assert floats_to_decimal(None) is None
        assert floats_to_decimal(True) is True

    def test_nested_dict_and_list(self) -> None:
        out = floats_to_decimal({"a": 0.1, "b": [0.2, {"c": 0.3}], "d": "s", "e": None})
        assert out == {"a": Decimal("0.1"), "b": [Decimal("0.2"), {"c": Decimal("0.3")}], "d": "s", "e": None}

    def test_deeply_nested(self) -> None:
        out = floats_to_decimal({"l1": {"l2": {"l3": [{"score": 0.75}]}}})
        assert out["l1"]["l2"]["l3"][0]["score"] == Decimal("0.75")


class TestDecimalsToFloat:
    def test_nested_decimals_become_floats(self) -> None:
        out = decimals_to_float({"a": Decimal("0.1"), "b": [Decimal("0.2"), {"c": Decimal("0.3")}]})
        assert out == {"a": 0.1, "b": [0.2, {"c": 0.3}]}
        assert isinstance(out["a"], float)

    def test_roundtrip(self) -> None:
        original = {"requirements": [{"id": "REQ-1", "score": 0.5}, {"id": "REQ-2", "score": 1.0}]}
        assert decimals_to_float(floats_to_decimal(original)) == original


class TestScoreItemContextValidator:
    def test_context_decimals_converted_on_read(self) -> None:
        # Simulate reading a score back from DynamoDB, where floats_to_decimal
        # turned nested per-requirement scores into Decimals on write.
        ddb_item = {
            "value": Decimal("0.36"),
            "context": {"requirements": [{"id": "REQ-1", "score": Decimal("0.5")}]},
        }
        model = ScoreItemModel.model_validate(ddb_item)
        assert model.value == 0.36
        assert model.context is not None
        nested_score = model.context["requirements"][0]["score"]
        assert nested_score == 0.5
        assert not isinstance(nested_score, Decimal)

    def test_none_context(self) -> None:
        assert ScoreItemModel.model_validate({"value": Decimal("1.0")}).context is None
