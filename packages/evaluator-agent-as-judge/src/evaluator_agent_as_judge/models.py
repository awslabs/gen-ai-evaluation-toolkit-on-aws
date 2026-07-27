import math
from collections import Counter
from typing import Any, Dict, List, Optional, Self

from pydantic import BaseModel, ConfigDict, Field, alias_generators, field_validator, model_validator

from evaluator_agent_as_judge.builtins import BUILT_IN_EVALUATORS


class S3Ref(BaseModel):
    """Reference to an S3 location (bucket + prefix).

    Attributes:
        bucket_name: Name of the S3 bucket.
        prefix: Key prefix within the bucket. Defaults to the bucket root.
    """

    # Allows JSON fields in camelCase
    model_config = ConfigDict(populate_by_name=True, alias_generator=alias_generators.to_camel)

    bucket_name: str
    prefix: str = ""


class Evaluator(BaseModel):
    """A custom evaluator definition passed to the Agent-as-Judge scorer.

    Attributes:
        name: Short identifier for the evaluator (used in score result names).
        description: Instructions given to the agent describing what to evaluate.
        config: Optional free-form parameters forwarded to the agent as YAML context.
        output_schema: Optional JSON Schema (Draft 7) the verdict ``context`` field must satisfy.
            When omitted, the agent may return any JSON-serialisable context.
        requirement_docs: Optional list of S3 prefixes whose contents are downloaded and
            made available to the agent as reference documents during evaluation.
    """

    # Allows JSON fields in camelCase
    model_config = ConfigDict(populate_by_name=True, alias_generator=alias_generators.to_camel)

    name: str = Field(min_length=1)
    description: str = Field(min_length=1)
    config: Optional[Dict[str, Any]] = None
    output_schema: Optional[Dict[str, Any]] = None
    requirement_docs: Optional[List[S3Ref]] = None


class BuiltInEvaluator(BaseModel):
    """Reference to a pre-defined built-in evaluator template.

    Built-in evaluators ship with a curated description and a default output schema.
    Callers may override ``output_schema`` and supply ``requirement_docs`` and ``config``
    just as they would for a custom :class:`Evaluator`.

    Use :meth:`to_evaluator` to convert to a fully-resolved :class:`Evaluator` instance.

    Attributes:
        built_in: Name of the built-in evaluator (e.g. ``"requirements-compliance"``).
        config: Optional free-form parameters forwarded to the agent as YAML context.
        output_schema: Optional JSON Schema override. When omitted, the built-in default is used.
        requirement_docs: Optional list of S3 prefixes containing reference documents.
    """

    # Allows JSON fields in camelCase
    model_config = ConfigDict(populate_by_name=True, alias_generator=alias_generators.to_camel)

    built_in: str = Field(min_length=1)
    config: Optional[Dict[str, Any]] = None
    output_schema: Optional[Dict[str, Any]] = None
    requirement_docs: Optional[List[S3Ref]] = None

    def to_evaluator(self) -> "Evaluator":
        definition = BUILT_IN_EVALUATORS.get(self.built_in)
        if definition is None:
            raise ValueError(f"Unknown built-in evaluator: {self.built_in!r}")

        # Caller-supplied outputSchema takes precedence; fall back to built-in default
        output_schema = definition.default_output_schema
        if self.output_schema is not None:
            output_schema = self.output_schema

        return Evaluator(
            name=self.built_in,
            description=definition.description,
            config=self.config,
            output_schema=output_schema,
            requirement_docs=self.requirement_docs,
        )


class AgentAsJudgeParams(BaseModel):
    """Per-invocation params passed via score_params for the dynamic scorer."""

    # Allows JSON fields in camelCase
    model_config = ConfigDict(populate_by_name=True, alias_generator=alias_generators.to_camel)

    agent_model: str = "global.anthropic.claude-sonnet-4-6"
    agent_temperature: float = 0.1


class EvaluationContext(BaseModel):
    """Optional contextual data attached to a test case.

    Extra fields beyond ``artifacts`` are allowed and forwarded to the agent as-is,
    enabling callers to pass arbitrary structured context without modifying the model.

    Attributes:
        artifacts: Optional list of S3 prefixes containing files the agent should explore.
    """

    # Allows JSON fields in camelCase and allow extra fields
    model_config = ConfigDict(populate_by_name=True, alias_generator=alias_generators.to_camel, extra="allow")

    artifacts: Optional[List[S3Ref]] = None


class EvalTestCase(BaseModel):
    """Test case data passed to the agent judge.

    All fields are optional — the agent validates at runtime that there is
    at least some meaningful content to evaluate (see the judge system prompt).
    This allows maximum flexibility: users may supply any combination of
    input, output, context, and artifacts.
    """

    # Allows JSON fields in camelCase and allow extra fields
    model_config = ConfigDict(populate_by_name=True, alias_generator=alias_generators.to_camel, extra="allow")

    input: Optional[Any] = None
    output: Optional[Any] = None
    context: Optional[EvaluationContext] = None


class PartialScore(BaseModel):
    """A single per-metric partial score reported by the agent judge.

    The agent reports one of these per metric it evaluates. The verdict's overall
    ``score`` is derived from the full list as a weighted average — the agent never
    computes the aggregate itself (see :class:`AgentVerdict`).

    Attributes:
        name: Label for the metric. Must be unique across a verdict's ``scores`` list.
            Leading/trailing whitespace is stripped; blank names are rejected.
        score: The metric's score in [0, 1]. Must be finite.
        weight: Relative importance, in ``[0, 1000]``. Defaults to 1.0. A weight of 0 records
            the metric without letting it affect the aggregate score. Must be finite.
    """

    name: str = Field(min_length=1)
    score: float = Field(ge=0, le=1)
    weight: float = Field(default=1.0, ge=0, le=1000.0)

    @field_validator("name")
    @classmethod
    def _strip_name(cls, v: str) -> str:
        # min_length=1 counts characters, so a whitespace-only name like "   " slips
        # through. Strip and reject blanks so metric names are always visible and the
        # uniqueness check keys off the normalised value.
        stripped = v.strip()
        if not stripped:
            raise ValueError("metric name cannot be blank or whitespace-only")
        return stripped

    @field_validator("score", "weight")
    @classmethod
    def _reject_non_finite(cls, v: float) -> float:
        # ge/le bounds accept float('inf'); JSON "Infinity"/"NaN" parse to floats too.
        # A non-finite score or weight poisons the derived weighted average (inf/inf -> nan)
        # and would silently pass the aggregate's ge=0,le=1 guard.
        if not math.isfinite(v):
            raise ValueError("must be a finite number")
        return v


class AgentVerdict(BaseModel):
    """Structured verdict written by the agent judge via the ``writeVerdict`` MCP tool.

    The agent supplies the per-metric ``scores`` breakdown; the overall ``score`` is
    derived from it (a weighted average) rather than supplied by the agent, so the
    aggregate arithmetic is always exact.

    Attributes:
        scores: Non-empty list of per-metric partial scores. Metric names must be unique.
        summary: Human-readable explanation of the verdict.
        issues: List of specific issues found (may be empty for a passing evaluation).
        context: Optional structured data conforming to the evaluator's ``output_schema``.
        score: Overall score in [0, 1], derived from ``scores`` as a weighted average
            (rounded to 3 dp). Do not set this directly — it is computed on validation.
    """

    scores: List[PartialScore] = Field(min_length=1)
    summary: str = Field(min_length=1)
    issues: List[str] = Field(default_factory=list)
    context: Any = None
    # Placeholder default: always overwritten by _derive_score on validation. Callers
    # must not set this — it is computed from `scores` as a weighted average.
    score: float = Field(default=0.0, ge=0, le=1)

    @model_validator(mode="after")
    def _derive_score(self) -> Self:
        # Metric names must be unique so the breakdown is unambiguous and keyable by name.
        names = [s.name for s in self.scores]
        duplicates = sorted(n for n, count in Counter(names).items() if count > 1)
        if duplicates:
            raise ValueError(f"duplicate metric name(s) in scores: {', '.join(duplicates)}")

        # Derive the overall score as a weighted average of the partial scores.
        total_weight = sum(s.weight for s in self.scores)
        if total_weight == 0:
            raise ValueError("cannot derive overall score: the weights of all scores sum to zero")

        weighted_sum = sum(s.weight * s.score for s in self.scores)
        self.score = round(weighted_sum / total_weight, 3)
        return self
