# Local Development Scripts

Temporary scripts for local testing until this plugin is deployed via CDK.

## Prerequisites

- AWS credentials with Bedrock access configured
- Node.js 20+

## Usage

```bash
# Run with default config (complex-agent-config.json)
npx tsx scripts/test-local.ts

# Override total test cases
npx tsx scripts/test-local.ts --total 10

# Custom config file
npx tsx scripts/test-local.ts --config path/to/config.json

# Override model
npx tsx scripts/test-local.ts --model anthropic.claude-sonnet-4-5-20250929-v1:0
```

## Output

Results are written to `./output/<run-id>/`:

- `1-taxonomy.json` - Coverage taxonomy
- `2-scenarios.json` - Sampled scenarios
- `3-base-test-cases.json` - Base test cases before augmentation and review sampling
- `4-augmented.json` - Augmented cases (only when `augmentationStrategies` is set in config)
- `5-test-cases/` - Final test case files (base + augmented, with `requiresReview` tags from review sampling)
- `5-test-cases-all.json` - All final test cases combined

The `output/` directory is git-ignored.
