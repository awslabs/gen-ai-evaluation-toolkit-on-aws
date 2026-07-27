# evaluator-fmeval

FMEval scorer for the Gen AI Evaluation Toolkit. Wraps Amazon's FMEval library as an SDK v2 scorer.

> **Note:** This package is excluded from the mono-repo build. Installing fmeval and its dependencies takes 10-20 minutes.

## Install

```bash
cd packages/evaluator-fmeval
UV_PROJECT_ENVIRONMENT=.venv uv sync --dev
```

## Test

```bash
# Unit tests (mocked, fast)
uv run pytest tests/test_fmeval.py

# E2E tests (requires fmeval installed)
uv run pytest -m e2e
```
