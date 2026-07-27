# GenAI-ETK Experiment Lambdas

Python Lambda functions for experiment tracking and MLflow integration in the GenAI Evaluation Toolkit.

### Installing Dependencies

```bash
nx install experiment-lambdas
```

## Commands

### Build Commands

```bash
# Build all packages including experiment-lambdas (workspace-level)
mise run build

# Build only experiment-lambdas package (from experiment-lambdas directory)
nx build experiment-lambdas

# Or using hatch directly (from experiment-lambdas directory)
hatch build
```

### Development Commands

```bash
# Run tests for experiment-lambdas only (from experiment-lambdas directory)
nx test experiment-lambdas

# Or using hatch directly (from experiment-lambdas directory)
hatch test

# Run type checking (from experiment-lambdas directory)
hatch run test:typing

# Lint code (from experiment-lambdas directory)
hatch run test:lint

# Run all verification checks without modifying code (from experiment-lambdas directory)
hatch run test:check

# Format code (modifies files to follow style rules) (from experiment-lambdas directory)
hatch run test:format

# Fix code style and lint issues automatically (from experiment-lambdas directory)
hatch run default:fix
```

## Development Workflow

1. Make changes to Python code in `src/`
2. Run tests: `hatch test`
3. Check types: `hatch run test:typing`
4. Lint code: `hatch run test:lint`
5. Build package: `nx build experiment-lambdas`

## Dependencies

This package uses:

- **Hatch** for Python environment and dependency management
- **MLflow** for experiment tracking
- **AWS Lambda Powertools** for Lambda utilities
- **Boto3** for AWS SDK integration
- **Pytest** for testing
- **Ruff** for linting and formatting
- **MyPy** for type checking
