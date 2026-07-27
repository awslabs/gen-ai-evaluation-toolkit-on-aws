# GenAI ETK TypeScript Integration Tests

This package contains TypeScript integration tests for the GenAI ETK system. The tests validate API functionality, plugin behavior, and end-to-end workflows.

## What This Package Does

- Tests GenAI ETK API endpoints and functionality
- Validates evaluation and generation plugin integrations
- Performs end-to-end workflow testing
- Includes performance benchmarks for plugins
- Provides data cleanup utilities for testing environments

## Running Tests

**Short running tests**: `npm run test:short`
**Long running evaluation tests**: `npm run test:long-eval`
**Long running GTG tests**: `npm run test:long-gtg`

### Benchmarks

Performance benchmarks are located in `benchmarks` and measure plugin performance:

```bash
npm run benchmark
```

Note: Benchmarks are experimental and may not be fully reliable yet.

### Data Cleanup

To clean up test data from DynamoDB and S3:

```bash
npm run cleanup
```

**Use with caution!** This deletes user data

## Troubleshooting

- **Build failures**: Ensure CLI package is built first (`mise run build`)
- **Model access**: Verify Bedrock model access in AWS console
- **Stuck jobs**: Check ECS tasks and Bedrock batch jobs in AWS console
- **Plugin issues**: Review ECS task logs for running/failing plugins
