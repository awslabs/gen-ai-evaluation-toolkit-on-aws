# Development

This guide covers building the Gen AI Evaluation Toolkit on AWS from source and working
in the monorepo.

## Prerequisites

- An AWS account, with credentials available in your shell.
- Docker.
- [mise](https://mise.jdx.dev/getting-started.html), which installs Node.js, nx, and
  hatch.

## Install

```bash
# Install tooling and all package dependencies
mise run install-all
```

`mise run install-all` installs the base workspace dependencies, runs code generation,
and builds the generated clients. To install only the base tooling, run `mise run
install` followed by `mise run codegen`.

Node packages share a root `package-lock.json` through npm workspaces. To add or update
a dependency for one package, run npm from the repo root with the workspace flag:

```bash
npm install --save-dev <package> -w packages/<name>
```

## Code generation

Run `mise run codegen` before any other task. It generates the TypeScript and Python
clients from the Smithy models in `packages/models/`. Generated code is not committed,
so re-run `codegen` after you change a Smithy model.

## Workspace structure

```text
packages/
├── cdk/                   # CDK constructs and stacks
├── cli/                   # Command-line interface
├── deployment/            # CDK deployment app
├── terraform/             # Terraform module (mirrors cdk/)
├── terraform-deployment/  # Terraform deployment wrapper (mirrors deployment/)
├── models/                # Smithy API model definitions
├── generated/             # Generated client SDKs (not committed)
├── python-api/            # Python API backend (Evaluator API v2)
├── evaluator-sdk/         # Python SDK for building custom evaluators
├── evaluator-*/           # Evaluators (built-in, FMEval, PyRIT, Agent-as-Judge)
├── plugin-gen-*/          # Generation plugins
├── experiment-*/          # Experiment utilities
└── tests-*/               # Integration tests
```

Each package has its own README. Run `mise tasks` to list available tasks and
`mise run nx-ls` to list packages.

## Build

```bash
mise run build
```

This builds all packages in order and exports the outputs to `output/`:

```text
output/
├── images/       # Docker images
├── node/         # Exported Node modules
├── python/       # Exported Python modules (tars/ and wheels/)
└── openapi.json  # OpenAPI specification generated from the Smithy models
```

## Tasks and nx

Tasks are defined in `mise.toml`; run them with `mise run <task>`. Package-level builds
use nx, for example `nx build cli`.

## Deploy

With AWS CDK:

```bash
mise run codegen
mise run deploy
```

With Terraform, see
[packages/terraform-deployment/README.md](packages/terraform-deployment/README.md) for
the plan/apply targets and bootstrap runbook.

## Releases

To keep package versions consistent, set the version in the root `package.json` and run
`mise run sync-versions`.

## Troubleshooting

If nx does not recognise packages:

```bash
nx daemon --stop   # or: mise run nx-refresh
```

To clear the nx cache:

```bash
nx reset           # or: mise run nx-reset
```

Progress bars are disabled by default for clean CI output. To enable them locally,
create `mise.local.toml`:

```toml
[env]
HATCH_INTERACTIVE = false
PIP_PROGRESS_BAR = false
```

In mise, setting an environment variable to `false` unsets it. Unsetting these two
variables re-enables the progress bars that the tools suppress for clean CI output.
