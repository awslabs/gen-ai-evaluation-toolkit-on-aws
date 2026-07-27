# Python API (Evaluator API v2)

ETK SDK v2 API backend using AWS Lambda Powertools.

## Routes

| Method | Path | Description |
|--------|------|-------------|
| POST | `/v2/evaluators/<name>/jobs/evaluate` | Submit full evaluation job |
| POST | `/v2/evaluators/<name>/jobs/score` | Submit scoring-only job |
| POST | `/v2/evaluators/<name>/jobs/invoke` | Submit app invocation job |
| GET | `/v2/jobs/<jobId>` | Get job status |
| GET | `/v2/evaluators/<name>/jobs` | List jobs |
| PUT | `/v2/jobs/<jobId>/status` | Update job status |
| POST | `/v2/reports` | Create report |
| GET | `/v2/reports` | List reports |
| GET | `/v2/reports/<reportId>` | Get report |
| DELETE | `/v2/reports/<reportId>` | Delete report (cascades results) |
| POST | `/v2/reports/<reportId>/results/batch` | Batch create results |
| POST | `/v2/reports/<reportId>/results/scores/batch` | Batch update scores |
| POST | `/v2/reports/<reportId>/results/delete/batch` | Batch delete results |
| GET | `/v2/reports/<reportId>/results/<resultId>` | Get result |
| GET | `/v2/reports/<reportId>/results` | List results |

## Local Development

```bash
# Install dependencies
uv sync --dev

# Run tests
uv run pytest tests --cov=evaluator_api --cov-report=term

# Lint
uv run ruff check src tests

# Type check
uv run mypy src
```

## Architecture

```
API Gateway (IAM Auth) → Lambda (Powertools) → DynamoDB
```

Single Lambda handles all routes via `APIGatewayRestResolver`.
