# Gen AI Evaluation Toolkit on AWS

Gen AI Evaluation Toolkit on AWS is a flexible, cloud-native accelerator built on
AWS serverless architecture that enables comprehensive evaluation of generative AI
applications — a foundation you deploy into your own AWS account, own in full
source, and extend. It provides end-to-end capabilities including test case
generation and version management, both metrics- and LLM-based quality
assessments, and visualization of experiment results. It uses a plugin-based
extensible architecture to support multiple evaluation frameworks and methods
throughout the application lifecycle.

## Features

- **Pluggable evaluation.** Run LLM-as-Judge, RAGAS, DeepEval, and Amazon Bedrock
  AgentCore scorers through the built-in evaluators, or FMEval, PyRIT red-teaming,
  and Agent-as-Judge evaluations for model and agent assessment.
- **Evaluator SDK.** Build custom evaluators in Python with the Evaluator SDK
  (`packages/evaluator-sdk/`) and run them through the toolkit.
- **Test-case generation.** Generate ground-truth test cases, with LLM-as-Judge
  filtering.
- **Flexible compute.** Run plugins on AWS Lambda for fast, scalable workloads, or on
  Amazon ECS for high-memory, long-running jobs.
- **Custom plugins.** Add your own generation plugins through factory functions.
- **API and clients.** Call a REST API, or use the generated TypeScript and Python
  clients.
- **Command-line interface.** Manage evaluations and deployments from the command line.
- **Infrastructure as code.** Deploy the toolkit with AWS CDK or Terraform.

## Use cases

- Assess model quality across accuracy, toxicity, robustness, or custom metrics.
- Evaluate retrieval-augmented generation (RAG) pipelines and agentic systems.
- Run experiments to compare models or configurations.
- Add evaluations to a CI/CD pipeline.

## Architecture

ETK deploys into your AWS account as a serverless application. A REST API (Amazon API
Gateway) fronts AWS Lambda functions that orchestrate evaluation and generation plugins.
Plugins run on AWS Lambda or Amazon ECS. For a full description of the components and
design, see the [Solution Guide](docs/solution_guide/Gen-AI-ETK-SolutionGuide.md).

## Quickstart

### Prerequisites

- An AWS account, with credentials available in your shell.
- Permissions to deploy and run the toolkit's resources.
- Docker.
- [mise](https://mise.jdx.dev/getting-started.html), which installs the remaining tools
  (Node.js, nx, and hatch).

### Deploy

Two infrastructure-as-code paths are supported — use whichever fits your environment.

**AWS CDK**

```bash
# Install tooling and dependencies
mise run install-all

# Bootstrap CDK (first-time only, once per account/region)
mise run bootstrap

# Deploy into your AWS account
mise run deploy
```

**Terraform** — see
[packages/terraform-deployment/README.md](packages/terraform-deployment/README.md) for
prerequisites, plan/apply targets, and the bootstrap runbook. The Terraform module
itself lives in `packages/terraform/` and mirrors the CDK constructs in
`packages/cdk/`.

To build from source, work in the monorepo, or troubleshoot the build, see
[DEVELOPMENT.md](DEVELOPMENT.md).

### Run an evaluation

Use the CLI or the generated TypeScript and Python clients to submit and manage
evaluations. See the [User Guide](docs/user_guide/Gen-AI-ETK-UserGuide.md) for
end-to-end examples.

## Documentation

- [Solution Guide](docs/solution_guide/Gen-AI-ETK-SolutionGuide.md) — architecture,
  design, and deployment.
- [User Guide](docs/user_guide/Gen-AI-ETK-UserGuide.md) — configuration and usage.
- **SDK references** — the Evaluator SDK and generated client references under
  `docs/sdk/`.
- **API reference** — generated from the Smithy models in `packages/models/`. Running
  `mise run codegen` produces an OpenAPI specification and the clients.

## Third-party dependencies

This project is distributed as source. It does not bundle or redistribute its
dependencies; they are resolved and installed by you through npm and pip. The notes
below cover dependencies whose licences differ from this project's Apache-2.0
licence.

**NVIDIA CUDA runtime libraries.** Although this repository is released under the
Apache-2.0 licence, the GPU code path of its fmeval evaluator
(`packages/evaluator-fmeval`) transitively installs the third-party NVIDIA CUDA
runtime libraries (the `nvidia-*-cu12` packages). The NVIDIA CUDA project's
licensing includes the NVIDIA CUDA Toolkit End User License Agreement
(https://docs.nvidia.com/cuda/eula/), which is not an open-source licence. These
libraries are installed only for GPU usage; CPU-only installations do not pull
them.

**Mozilla Public License 2.0 (MPL-2.0) components.** Although this repository is
released under the Apache-2.0 licence, some of its Python dependencies are
licensed under the Mozilla Public License 2.0 (MPL-2.0), a file-level copyleft
licence — for example `certifi`, `pathspec`, and `tqdm` (tqdm is `MPL-2.0 AND
MIT`). These components are used unmodified.

## Contributing

This repository is published as a read-only mirror. We are not accepting pull requests
at this time. You are welcome to report bugs and share feedback through GitHub Issues.
See [CONTRIBUTING.md](CONTRIBUTING.md) for details including direction for Amazon
employees.

## Security

See [SECURITY.md](SECURITY.md) for more information.

## License

This project is licensed under the Apache-2.0 License.
