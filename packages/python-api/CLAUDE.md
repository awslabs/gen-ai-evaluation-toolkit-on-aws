# python-api

Lambda REST API for the evaluation toolkit.

## Structure
```
src/evaluator_api/
├── handler.py          # Lambda entry point
├── routes/
│   ├── __init__.py     # App, DAOs, init_aws, exceptions
│   ├── evaluator_jobs.py
│   ├── reports.py
│   ├── results.py
│   └── models.py       # Pydantic route models
└── ddb/
    ├── __init__.py
    ├── dao.py           # DynamoDB DAOs
    └── models.py        # DynamoDB Pydantic models
```

## Commands
```bash
uv sync --dev                        # Install deps
uv run pytest tests --cov=evaluator_api --cov-report=term  # Run tests
uv run ruff check src tests          # Lint
uv run mypy src                      # Type check
```

## Key Patterns
- DAO pattern for DDB operations
- Pydantic models separate for API vs persistence
- Concurrent score writes use `SET #scores.#score_name = :value`

## E2E Testing

Tests support dual mode: **onebox** (moto mocks, default) and **e2e** (real AWS).

### Required env vars for e2e
- `ETK_API_ENDPOINT` — API Gateway URL (e.g. `https://abc123.execute-api.eu-west-2.amazonaws.com/prod`)
- `ETK_AWS_REGION` — AWS region (default: `us-east-1`)

### Running e2e tests
```bash
# Onebox (default) — e2e tests are auto-excluded
uv run pytest tests

# E2E — requires real endpoint + AWS credentials
ETK_API_ENDPOINT=https://... ETK_AWS_REGION=eu-west-2 uv run pytest tests -m e2e
```

### mise.local.toml example
```toml
[env]
ETK_API_ENDPOINT = "https://abc123.execute-api.eu-west-2.amazonaws.com/prod"
ETK_AWS_REGION = "eu-west-2"
```
