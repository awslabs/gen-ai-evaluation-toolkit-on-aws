# evaluator-sdk

Python SDK for building custom evaluators that integrate with the Gen AI Evaluation Toolkit.

## Structure
```
src/evaluator_sdk/
├── __init__.py      # Public exports
├── models.py        # Public types: ScoreResult, TestResult, EvaluationResult/Response, EvaluatorError, type aliases
├── scorer.py        # Scorer ABC, scorer decorator, scorer helpers
├── batching.py      # _ScoreBatchFlusher, _ResultCollector (internal batching machinery)
├── evaluator.py     # Evaluator class, EtkClient factory
└── py.typed         # PEP 561 marker
```

## Key types
- `Evaluator` — main class; call `evaluate(testcases=...)` to run the full pipeline
- `Scorer` — ABC for plugin scorers that produce multiple sub-scores
- `ScoreResult` — value + optional error/reason for a single score
- `TestResult` — the single object handed to scorers (input, output, expected, context, metadata, app_metrics, error)
- `EvaluationResult` — single testcase result (input, output, expected, context, scores, error, metadata)
- `EvaluationResponse` — returned by `evaluate()` (report_id, job_id, results)
- `EvaluatorError` — base exception
- `AppInvokeFn` / `ScorerFn` — type aliases for user-provided callables

## Commands
```bash
uv run pytest tests --ignore=tests/onebox --cov=evaluator_sdk --cov-report=term  # Unit tests
uv run pytest tests/onebox                                                        # Onebox integration tests (needs python-api)
uv run ruff check src tests && uv run mypy src                                    # Lint + mypy
```

## Tests
- `tests/` — unit tests using mocks, no monorepo dependencies
- `tests/onebox/` — integration tests that run the real python-api handler in-process via moto; only work inside the monorepo
