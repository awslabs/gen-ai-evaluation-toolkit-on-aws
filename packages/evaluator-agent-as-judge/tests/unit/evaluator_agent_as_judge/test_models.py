import pytest

from evaluator_agent_as_judge.builtins import BUILT_IN_EVALUATORS
from evaluator_agent_as_judge.models import (
    AgentVerdict,
    BuiltInEvaluator,
    EvalTestCase,
    EvaluationContext,
    Evaluator,
    PartialScore,
    S3Ref,
)


class TestTestCaseContextExtraFields:
    def test_extra_fields_are_accepted(self) -> None:
        ctx = EvaluationContext(reference_answer="ground truth", metadata={"id": "abc"})

        assert ctx.reference_answer == "ground truth"
        assert ctx.metadata == {"id": "abc"}

    def test_extra_fields_are_preserved_in_model_dump(self) -> None:
        ctx = EvaluationContext(reference_answer="ground truth", metadata={"id": "abc"})

        dumped = ctx.model_dump()

        assert dumped["reference_answer"] == "ground truth"
        assert dumped["metadata"] == {"id": "abc"}

    def test_camel_case_extra_fields_round_trip_through_json(self) -> None:
        """Extra fields provided in camelCase JSON are stored and re-emitted under the same key."""
        json_str = '{"referenceAnswer": "ground truth", "metadata": {"id": "abc"}}'

        ctx = EvaluationContext.model_validate_json(json_str)
        dumped = ctx.model_dump()

        # Extra fields retain their original camelCase key (alias_generator only applies to declared fields)
        assert dumped["referenceAnswer"] == "ground truth"
        assert dumped["metadata"] == {"id": "abc"}

    def test_declared_artifacts_field_not_affected_by_extra_fields(self) -> None:
        ctx = EvaluationContext(
            artifacts=[S3Ref(bucket_name="b", prefix="p/")],
            extra_field="extra value",
        )

        assert ctx.artifacts is not None
        assert ctx.artifacts[0].bucket_name == "b"
        assert ctx.extra_field == "extra value"

    def test_context_with_no_extra_fields_serializes_correctly(self) -> None:
        ctx = EvaluationContext(artifacts=None)

        dumped = ctx.model_dump()

        assert dumped == {"artifacts": None}

    def test_context_with_only_extra_fields_and_no_artifacts(self) -> None:
        ctx = EvaluationContext(note="only extras here")

        dumped = ctx.model_dump()

        assert dumped["artifacts"] is None
        assert dumped["note"] == "only extras here"


class TestEvalTestCaseAllFieldsOptional:
    def test_empty_test_case_is_valid(self) -> None:
        tc = EvalTestCase()
        assert tc.input is None
        assert tc.output is None
        assert tc.context is None

    def test_input_only(self) -> None:
        tc = EvalTestCase(input="some input")
        assert tc.input == "some input"
        assert tc.output is None

    def test_output_only(self) -> None:
        tc = EvalTestCase(output={"answer": "42"})
        assert tc.output == {"answer": "42"}
        assert tc.input is None

    def test_input_and_output_both_set(self) -> None:
        tc = EvalTestCase(input="what is the answer?", output="42")
        assert tc.input == "what is the answer?"
        assert tc.output == "42"

    def test_output_included_in_model_dump(self) -> None:
        tc = EvalTestCase(input="q", output={"result": "r"})
        dumped = tc.model_dump()
        assert dumped["output"] == {"result": "r"}

    def test_extra_top_level_fields_are_accepted(self) -> None:
        tc = EvalTestCase(input="submit this", expected_output="correct answer", custom_field="value")

        assert tc.expected_output == "correct answer"
        assert tc.custom_field == "value"

    def test_extra_top_level_fields_are_preserved_in_model_dump(self) -> None:
        tc = EvalTestCase(input="submit this", expected_output="correct answer", custom_field="value")

        dumped = tc.model_dump()

        assert dumped["input"] == "submit this"
        assert dumped["expected_output"] == "correct answer"
        assert dumped["custom_field"] == "value"

    def test_camel_case_extra_field_deserialization_via_model_validate(self) -> None:
        data = {"input": "submit this", "expectedOutput": "correct answer", "customField": "value"}

        tc = EvalTestCase.model_validate(data)
        dumped = tc.model_dump()

        assert dumped["input"] == "submit this"
        assert dumped["expectedOutput"] == "correct answer"
        assert dumped["customField"] == "value"

    def test_artifacts_excluded_from_dump_while_context_extras_remain(self) -> None:
        data = {
            "input": "submit this",
            "output": "the answer",
            "context": {
                "artifacts": [{"bucketName": "b", "prefix": "p/"}],
                "referenceAnswer": "ref",
            },
        }

        tc = EvalTestCase.model_validate(data)
        dumped = tc.model_dump(exclude={"context": {"artifacts"}})

        assert "artifacts" not in dumped["context"]
        assert dumped["context"]["referenceAnswer"] == "ref"
        assert dumped["output"] == "the answer"

    def test_test_case_with_no_fields_serializes_to_minimal_dict(self) -> None:
        tc = EvalTestCase()

        dumped = tc.model_dump()

        assert dumped == {"input": None, "output": None, "context": None}


class TestBuiltInEvaluatorToEvaluator:
    def test_known_builtin_returns_evaluator(self) -> None:
        name = next(iter(BUILT_IN_EVALUATORS))  # first registered built-in
        bi = BuiltInEvaluator(built_in=name)

        result = bi.to_evaluator()

        assert isinstance(result, Evaluator)
        assert result.name == name

    def test_known_builtin_uses_definition_description(self) -> None:
        name = next(iter(BUILT_IN_EVALUATORS))
        definition = BUILT_IN_EVALUATORS[name]
        bi = BuiltInEvaluator(built_in=name)

        result = bi.to_evaluator()

        assert result.description == definition.description

    def test_known_builtin_uses_default_output_schema_when_caller_provides_none(self) -> None:
        name = next(iter(BUILT_IN_EVALUATORS))
        definition = BUILT_IN_EVALUATORS[name]
        bi = BuiltInEvaluator(built_in=name)

        result = bi.to_evaluator()

        assert result.output_schema == definition.default_output_schema

    def test_caller_supplied_output_schema_overrides_default(self) -> None:
        name = next(iter(BUILT_IN_EVALUATORS))
        custom_schema: dict = {"type": "object", "properties": {"custom": {"type": "string"}}}
        bi = BuiltInEvaluator(built_in=name, output_schema=custom_schema)

        result = bi.to_evaluator()

        assert result.output_schema == custom_schema

    def test_caller_config_is_forwarded(self) -> None:
        name = next(iter(BUILT_IN_EVALUATORS))
        cfg = {"threshold": 0.8, "strict": True}
        bi = BuiltInEvaluator(built_in=name, config=cfg)

        result = bi.to_evaluator()

        assert result.config == cfg

    def test_requirement_docs_forwarded_when_set(self) -> None:
        name = next(iter(BUILT_IN_EVALUATORS))
        docs = [S3Ref(bucket_name="my-bucket", prefix="docs/")]
        bi = BuiltInEvaluator(built_in=name, requirement_docs=docs)

        result = bi.to_evaluator()

        assert result.requirement_docs == docs

    def test_requirement_docs_is_none_when_not_set(self) -> None:
        name = next(iter(BUILT_IN_EVALUATORS))
        bi = BuiltInEvaluator(built_in=name)

        result = bi.to_evaluator()

        assert result.requirement_docs is None

    def test_unknown_builtin_raises_value_error(self) -> None:
        bi = BuiltInEvaluator(built_in="no-such-builtin")

        with pytest.raises(ValueError, match="no-such-builtin"):
            bi.to_evaluator()

    def test_camel_case_json_field_deserialization(self) -> None:
        """builtIn, outputSchema, and requirementDocs must deserialize from camelCase JSON."""
        name = next(iter(BUILT_IN_EVALUATORS))
        custom_schema: dict = {"type": "string"}
        data = {
            "builtIn": name,
            "outputSchema": custom_schema,
            "config": {"k": "v"},
            "requirementDocs": [{"bucketName": "b", "prefix": "p/"}],
        }

        bi = BuiltInEvaluator.model_validate(data)

        assert bi.built_in == name
        assert bi.output_schema == custom_schema
        assert bi.config == {"k": "v"}
        assert bi.requirement_docs is not None
        assert bi.requirement_docs[0].bucket_name == "b"
        assert bi.requirement_docs[0].prefix == "p/"


# ---------------------------------------------------------------------------
# PartialScore
# ---------------------------------------------------------------------------


class TestPartialScore:
    def test_valid_with_default_weight(self) -> None:
        ps = PartialScore(name="clarity", score=0.5)
        assert ps.weight == 1.0

    def test_valid_with_explicit_weight(self) -> None:
        ps = PartialScore(name="clarity", score=0.5, weight=2.5)
        assert ps.weight == 2.5

    @pytest.mark.parametrize("bad_score", [-0.1, 1.1, 2.0])
    def test_score_out_of_range_raises(self, bad_score: float) -> None:
        with pytest.raises(ValueError):
            PartialScore(name="m", score=bad_score)

    def test_negative_weight_raises(self) -> None:
        with pytest.raises(ValueError):
            PartialScore(name="m", score=0.5, weight=-1.0)

    def test_zero_weight_allowed(self) -> None:
        assert PartialScore(name="m", score=0.5, weight=0.0).weight == 0.0

    def test_empty_name_raises(self) -> None:
        with pytest.raises(ValueError):
            PartialScore(name="", score=0.5)

    def test_whitespace_only_name_raises(self) -> None:
        with pytest.raises(ValueError):
            PartialScore(name="   ", score=0.5)

    def test_name_is_stripped(self) -> None:
        assert PartialScore(name="  clarity  ", score=0.5).name == "clarity"

    @pytest.mark.parametrize("bad_weight", [float("inf"), float("-inf"), float("nan")])
    def test_non_finite_weight_raises(self, bad_weight: float) -> None:
        with pytest.raises(ValueError):
            PartialScore(name="m", score=0.5, weight=bad_weight)

    def test_non_finite_score_raises(self) -> None:
        with pytest.raises(ValueError):
            PartialScore(name="m", score=float("nan"))

    def test_none_score_raises(self) -> None:
        with pytest.raises(ValueError):
            PartialScore(name="m", score=None)  # type: ignore[arg-type]


# ---------------------------------------------------------------------------
# AgentVerdict — derived score
# ---------------------------------------------------------------------------


def _verdict(scores: list[dict], **kw: object) -> AgentVerdict:
    return AgentVerdict(scores=scores, summary="s", **kw)  # type: ignore[arg-type]


class TestAgentVerdictScoreDerivation:
    def test_default_weights_is_plain_mean(self) -> None:
        v = _verdict([{"name": "a", "score": 0.0}, {"name": "b", "score": 1.0}])
        assert v.score == 0.5

    def test_weighted_average(self) -> None:
        v = _verdict([{"name": "a", "score": 0.0, "weight": 1}, {"name": "b", "score": 1.0, "weight": 3}])
        assert v.score == 0.75

    def test_single_component(self) -> None:
        assert _verdict([{"name": "a", "score": 0.42}]).score == 0.42

    def test_rounds_to_three_dp(self) -> None:
        # 1/8 = 0.125 exactly; 1/3 rounds to 0.333
        assert _verdict([{"name": "a", "score": 0.125}]).score == 0.125
        v = _verdict([{"name": "a", "score": 1.0}, {"name": "b", "score": 0.0}, {"name": "c", "score": 0.0}])
        assert v.score == 0.333

    def test_zero_weight_excludes_component(self) -> None:
        v = _verdict([{"name": "a", "score": 0.0, "weight": 0}, {"name": "b", "score": 1.0, "weight": 2}])
        assert v.score == 1.0

    def test_derived_score_stays_in_range(self) -> None:
        v = _verdict([{"name": "a", "score": 1.0}, {"name": "b", "score": 1.0}])
        assert 0.0 <= v.score <= 1.0

    def test_agent_supplied_score_is_overwritten(self) -> None:
        v = _verdict([{"name": "a", "score": 0.2}], score=0.99)
        assert v.score == 0.2

    def test_all_zero_weights_raises(self) -> None:
        with pytest.raises(ValueError, match="sum to zero"):
            _verdict([{"name": "a", "score": 0.5, "weight": 0}])

    def test_duplicate_names_raises(self) -> None:
        with pytest.raises(ValueError, match="duplicate"):
            _verdict([{"name": "a", "score": 0.5}, {"name": "a", "score": 0.4}])

    def test_empty_scores_raises(self) -> None:
        with pytest.raises(ValueError):
            _verdict([])
