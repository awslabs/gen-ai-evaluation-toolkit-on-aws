"""Scorer ABC, score decorator, and scorer helpers."""

import inspect
from typing import Any

from evaluator_sdk.models import ScoreResult, ScorerFn, TestResult


def _to_score_result(raw: float | ScoreResult) -> ScoreResult:
    """Normalize a scorer return value to ScoreResult."""
    if isinstance(raw, ScoreResult):
        return raw
    return ScoreResult(value=raw)


def scorer(fn: Any = None, *, dynamic: bool = False) -> Any:
    """Mark a method as a score on a Scorer subclass.

    ::

        @scorer
        def length(self, test_result):
            return 1.0 if len(test_result.output.get("text", "")) > 0 else 0.0

    Use ``dynamic=True`` to mark a fallback handler for score names that
    don't have a dedicated ``@scorer`` method.  Dynamic handlers receive
    ``score_name`` and ``score_params`` in addition to the usual kwargs::

        @scorer(dynamic=True)
        def handle(self, score_name, score_params, test_result, params):
            ...

    Methods receive kwargs filtered by signature (test_result, params,
    score_name, score_params).  Return a float, ScoreResult, or dict for
    dynamic multi-score results.
    """
    def decorator(f: Any) -> Any:
        f._score = True
        f._score_dynamic = dynamic
        return f

    if fn is not None:
        # Called as @scorer without parens
        return decorator(fn)
    # Called as @scorer(dynamic=True)
    return decorator


class Scorer:
    """Base class for plugin scorers that produce multiple scores.

    Use ``@scorer`` to declare individual scoring methods::

        class MyScorer(Scorer):
            name = "quality"  # optional, defaults to class name

            @scorer
            def length(self, test_result):
                return 1.0 if len(test_result.output.get("text", "")) > 0 else 0.0

            @scorer
            def prefix(self, test_result):
                return 1.0 if test_result.output.get("text", "").startswith("Response:") else 0.0

    Each method can return:
    - ``float`` or ``ScoreResult`` — single score, named after the method
    - ``dict[str, float | ScoreResult]`` — multiple dynamic scores

    Alternatively, override ``score()`` directly for full control.
    """

    name: str | None = None
    available_scores: dict[str, dict[str, Any] | None] = {}
    _dynamic_handler_name: str | None = None

    # Cache of inspect.signature() results per method, built in __init_subclass__.
    # Maps method name → set of accepted parameter names (excluding 'self').
    _sig_cache: dict[str, set[str]] = {}

    def __init_subclass__(cls, **kwargs: Any) -> None:
        super().__init_subclass__(**kwargs)
        # Auto-populate available_scores from @scorer decorated methods,
        # cache the dynamic handler name (if any), and pre-compute
        # inspect.signature() for each handler so we don't repeat it per call.
        scores: dict[str, dict[str, Any] | None] = {}
        dynamic_name: str | None = None
        sig_cache: dict[str, set[str]] = dict(getattr(cls, "_sig_cache", {}))
        for attr_name in cls.__dict__:
            method = cls.__dict__[attr_name]
            if callable(method) and getattr(method, "_score_dynamic", False):
                dynamic_name = attr_name
                sig = inspect.signature(method)
                sig_cache[attr_name] = set(sig.parameters.keys()) - {"self"}
            elif callable(method) and getattr(method, "_score", False):
                scores[attr_name] = None
                sig = inspect.signature(method)
                sig_cache[attr_name] = set(sig.parameters.keys()) - {"self"}
        cls._sig_cache = sig_cache
        if dynamic_name is not None:
            cls._dynamic_handler_name = dynamic_name
        if scores:
            merged = dict(getattr(cls, "available_scores", {}))
            merged.update(scores)
            cls.available_scores = merged

    def score(
        self,
        test_result: TestResult,
        scores: dict[str, dict[str, Any] | None] | None = None,
        params: dict[str, Any] | None = None,
    ) -> dict[str, float | ScoreResult]:
        """Dispatch to @scorer methods. Override for full control."""
        results: dict[str, float | ScoreResult] = {}
        active = scores if scores is not None else self.available_scores

        # Look up the cached dynamic fallback handler, if any
        dynamic_handler = None
        if self._dynamic_handler_name:
            dynamic_handler = getattr(self, self._dynamic_handler_name, None)

        for score_name, score_config in active.items():
            # Try static @scorer first, then fall back to dynamic handler
            method = getattr(self, score_name, None)
            if method is not None and getattr(method, "_score", False):
                handler = method
            elif dynamic_handler is not None:
                handler = dynamic_handler
            else:
                continue

            # Build kwargs, filter to what the method accepts (use cached sig)
            kwargs: dict[str, Any] = {
                "test_result": test_result,
                "params": params,
                "score_params": score_config,
                "score_name": score_name,
            }
            handler_name = handler.__func__.__name__ if hasattr(handler, "__func__") else handler.__name__
            accepted = self._sig_cache.get(handler_name)
            if accepted is None:
                # Fallback for methods not cached (e.g. inherited without redefinition)
                sig = inspect.signature(handler)
                accepted = set(sig.parameters.keys()) - {"self"}
            kwargs = {k: v for k, v in kwargs.items() if k in accepted}

            raw = handler(**kwargs)

            if isinstance(raw, dict):
                results.update(raw)
            else:
                results[score_name] = raw

        return results


def _scorer_name(impl: ScorerFn | type[Scorer]) -> str:
    """Derive the registration name for a scorer."""
    if isinstance(impl, type) and issubclass(impl, Scorer):
        return impl.name or impl.__name__
    return impl.__name__
