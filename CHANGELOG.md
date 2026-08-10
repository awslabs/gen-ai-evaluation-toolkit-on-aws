# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.1] - 2026-08-05

Documentation and tooling fixes for the public OSS release. No functional
or API changes.

### Fixed

- **First-time CDK deploy on a clean account.** Added the missing
  `mise run bootstrap` step to the README and DEVELOPMENT quickstarts, so a
  fresh checkout deploys without a manual bootstrap.

### Removed

- Internal-only GitLab publish scripts (`scripts/publish/{node,python,docker}.sh`)
  and the `publish` task, plus the `gen-pipeline` task and `gen-pipeline.ts`
  (both wrote to `.gitlab/`, which is stripped from the OSS distribution).
- Internal-CI residue from docs: "Beta-account specifics" section and GitLab
  CI registration note removed from the Terraform deployment README.

## [2.0.0] - 2026-07-27

First GitHub release of the 2.0 line. Identical in features to
[2.0.0-beta] below, plus final pre-publication cleanup:

### Changed

- Internal tracking references removed from source comments.
- Changelog security entry corrected to cover the full npm + Python
  dependency sweep.

### Fixed

- **AgentCore scorer: submit raw OTEL documents to the Evaluate API.** The
  scorer previously reshaped OTEL event documents into span-shaped
  documents before submission. The Bedrock AgentCore `Evaluate` API
  classifies documents structurally and attaches event bodies (LLM
  messages, tool arguments) to their parent spans, so the reshaped events
  registered as untagged spans — failing every AgentCore evaluation with a
  multi-session `ValidationException`. The scorer now submits the raw
  documents and lets the service handle span/event association.

## [2.0.0-beta] - 2026-07-23

### Added

- **SDK v2 evaluator architecture.** New `evaluator-*` packages introduce a Python-first Lambda evaluator model: `evaluator-sdk` (Python SDK with `Evaluator`, `Scorer` ABC, `EtkClient` factory), `evaluator-builtin` (single Docker Lambda consolidating LLM-as-Judge, RAGAS, AgentCore, and DeepEval scorers), `evaluator-agent-as-judge` (agentic evaluator), `evaluator-fmeval` (FMEval integration), and `evaluator-pyrit` (PyRIT red-teaming). Evaluators run as Lambda functions dispatched via EventBridge and orchestrated by Step Functions; the toolkit exposes a `LambdaEvaluator` CDK construct for registering them.
- **Python API service (`python-api`).** New Python Lambda service exposing the `/v2/` REST API for evaluator jobs, reports, results, and score writes.
- **Agent-as-Judge (AAJ) plugin.** New agentic evaluator that lets an agent actively explore artifacts and gather evidence for scoring, deployed as a standalone Lambda in dedicated isolated subnets with deny-by-default IAM policy and least-privilege `execute-api:Invoke` paths (HTTP-verb-scoped). Final scores can be derived from weighted partial scores via a built-in calculator tool.
- **Annotation filters on evaluation jobs.** Evaluation jobs referencing a dataset (`DatasetReference`) can now supply an annotation filter expression, so a job scores only the test cases matching annotation conditions (string/numeric conditions combinable with and/or/not).
- **PyRIT red-teaming integration.** Automated adversarial red-teaming scorer for LLM security testing, wired into the SDK v2 evaluator model.
- **DeepEval scorer.** DeepEval integration added to `evaluator-builtin` with deployed-Lambda support for single-turn and multi-turn conversation evaluation.
- **Per-score `context` and `reason` fields.** Score results now carry an optional `context` field (arbitrary metadata persisted and returned) and a `reason` field (free-text rationale forwarded through the API). Score data model updated end-to-end (Smithy → generated clients → python-api → evaluator-sdk).
- **Agentic ground-truth generation plugin (`plugin-gen-agentic`).** New plugin for generating multi-turn tool-call test cases for agentic applications, with augmentation and review-sampling coverage. Built on top of `plugin-gen-sdk` shared utilities; the RAG generation plugin was also refactored to use them.
- **Terraform deployment path.** `packages/terraform` (customer-consumable root module + `modules/{common,datastore,evaluation,generation,experiment,plugins,telemetry}`) and `packages/terraform-deployment` (monorepo wrapper with S3 + DynamoDB backend, bootstrap scripts, and CI/CD wiring). Reaches feature parity with the CDK deployment path: dual API Gateway (private + optional public), existing-VPC deployment, customer-managed KMS, AAJ evaluator, all built-in evaluators, and full `cdk-nag` ↔ Checkov security-control parity.
- **Dual API Gateway (private + optional public).** The API Gateway construct now always creates a VPC-restricted private API and lets you additionally create a public EDGE or REGIONAL API via `publicEndpointType`. Fully-private deployments set `publicEndpointType: 'DISABLED'`. Both APIs share the same Lambda handlers.
- **Existing-VPC deployment support.** Both CDK and Terraform deployment paths now accept an existing VPC + subnets + security groups instead of creating their own. Existing-VPC deployments must also supply an execute-api interface VPC endpoint (`EXISTING_API_GW_VPC_ENDPOINT_ID` / `existing_api_gw_vpc_endpoint_id`): all evaluators call back through the private REST API, which is only reachable via this endpoint.
- **AI Gateway integration (optional).** New `gatewayConfig` construct prop and `AI_GATEWAY_*` env-var passthrough lets deployments route all plugin LLM calls through an OAuth2-fronted AI gateway (Bedrock Converse-compatible) for centralised cost tracking and budget enforcement. Fully opt-in; defaults to direct Bedrock.
- **`boto3` user-agent identification.** Toolkit-controlled boto3/botocore clients now inject a `gen-ai-evaluation-toolkit-on-aws/<version>` `user_agent_extra` so downstream services can identify traffic originating from ETK.
- **CLI report/result CRUD, config-referenced submit, stage progression.** CLI commands to list, describe, and manage reports and results end-to-end for SDK v2; submit a job by referencing an existing config; and observe stage progression through the evaluator lifecycle. Includes template fixes for the auto-generated CLI.
- **SDK reference documentation.** The documentation site now includes API references for the Python client, the Evaluator SDK, and the TypeScript client, generated as build artefacts.
- **Solution Guide: Access Control section.** New section covering IAM policy authoring for ETK API access with worked examples.

### Changed

- **Root package renamed** from `genai-etk` to `@awssolutions/gen-ai-evaluation-toolkit`, aligning with the rest of the `@awssolutions/gen-ai-evaluation-toolkit-*` family.
- **Full IAM ARN stored in ownership fields.** `createdBy` and `updatedBy` on all persisted records now store the full IAM ARN of the caller (previously session name only), improving auditability of cross-account and federated identities.
- **AgentCore evaluator: agentic GTG compatibility.** AgentCore evaluator improved to consume the multi-turn tool-call test cases emitted by the agentic generation plugin.
- **`TestCaseDataMixin` enhanced for agentic applications.** Additional multi-tool-call and conversation-history fields on the shared test-case model.
- **MATS telemetry removed.** The CDK constructs no longer emit MATS telemetry; deployments send no usage data to AWS-internal endpoints.
- **S3 lifecycle rules on solution buckets.** All solution-managed buckets now expire noncurrent object versions and clean up expired delete markers, preventing unbounded version growth on long-lived deployments.

### Changed (Breaking)

- **Evaluation plugin architecture replaced by SDK v2 evaluators.** The `plugin-eval-{fmeval,llm-as-judge,ragas,agentcore,sdk}` containerised-plugin packages are being retired in favour of the SDK v2 `evaluator-*` model. Deployment now targets Lambda-based evaluators dispatched via EventBridge. Customers with custom evaluation plugins written against the previous SDK need to port them to the `evaluator-sdk` `Scorer` interface.
- **API path structure for evaluators.** SDK v2 evaluators talk to a new `/v2/` API surface served by `python-api`. Direct callers of the previous plugin-oriented endpoints need to migrate; the CLI and generated clients handle this transparently.
- **Docker build pattern for generation plugins.** Plugins using `plugin-gen-sdk` mount the SDK at `/plugin-gen-sdk` in their container and use `npm ci` with an unmodified lockfile, replacing the previous `sed`-based path rewriting. Existing custom generation plugins require a Dockerfile update.

### Fixed

- **Cross-stack `evaluationBucket` reference retained** to prevent deploy failures on stack updates that would otherwise orphan the reference.
- **RAGAS: validate `reference_tool_calls` type before access.** Fixed an unhelpful runtime error when the field wasn't present or was the wrong type.
- **AAJ: evaluation context scoped per run.** The agent-as-judge evaluator previously reused evaluation context across runs in a warm Lambda, which could leak artifacts between test cases; context is now scoped to each run.
- **AAJ evaluator: resolve evaluators from per-score params.** Fixes cases where per-score evaluator overrides were not honoured.
- **`evaluator-sdk`: forward score `reason` to the API.** The SDK previously dropped the reason field when submitting scores.
- **`plugin-gen-agentic`: fail fast when no conversations load.** `dedupeAndSample` previously returned empty output silently; it now fails with an error, and S3 operations include error context for debuggability.
- **Terraform: shift `public[0]` subnet out of legacy /24 range.** Fixes a CIDR overlap for existing-VPC customers whose VPC used the legacy range.
- **API Gateway: stable CFN exports when toggling `publicEndpointType`.** Prevents CFN update failures when flipping a deployment between public and fully-private.

### Security

- **`model_args` allowlist enforced fail-closed in SDK v2 LLM-as-Judge scorer.** The `evaluator-builtin` LLM-as-Judge scorer applies the same allowlist introduced for the 1.2.0 plugin, with stricter semantics: disallowed keys (e.g. `endpoint_url`, `credentials_provider`) now fail validation with an error listing the rejected keys, instead of being dropped with a warning. Configs relying on non-allowlisted `model_args` keys must remove them.
- **Scheduler create/update validate the job template.** Creating or updating an evaluation schedule now applies the same validation as direct job submissions (jobType requirements, test-case and scorer structure), so malformed schedules are rejected up front instead of failing silently when they fire.
- **DynamoDB SSE explicitly enabled on the evaluator table (Terraform).** The Terraform module now always sets server-side encryption explicitly on `evaluatortable`, matching the CDK path.
- **AAJ: `execute-api:Invoke` scoped to least-privilege paths** with HTTP-verb restrictions; identity policy enforced on the AAJ execution role.
- **Removed broad `Allow *` from private API Gateway resource policy.** The private API's resource policy now uses a DENY-only statement scoped to `aws:SourceVpc`, so same-account IAM path restrictions on caller roles are enforced end-to-end. Previously a broad `Allow *` would bypass path-level grants for same-account callers.
- **Dockerfiles: add explicit `USER` instructions.** Resolves a CRITICAL security finding — every plugin container now runs as an explicit non-root user.
- **Request payloads no longer logged in experiment Lambdas.** The API Gateway and EventBridge handler wrappers previously logged the full event, extracted body, and validated payload at `INFO` — potentially exposing evaluation data (prompts, expected outputs, model config) to anyone with CloudWatch Logs access. They now log only non-sensitive request metadata.
- **Caller identity recorded in API audit logs.** The `python-api` request-logging middleware now appends the IAM caller ARN to every log line, so destructive and privileged operations (report deletion, job status updates, result writes) are attributable in application logs.
- **Dependency vulnerabilities cleared across npm and Python lockfiles.** Overrides/bumps for `fast-uri`, `gitpython`, `protobuf`, `lxml`, `sagemaker`, and `aws-cdk-lib` clear the known critical and high advisories. A small number of remaining findings are blocked behind upstream major-version constraints (fmeval's `transformers<5` / `sagemaker<3` pins, the MLflow client pin) or have no upstream fix, and are documented as deferred.

## [1.2.0-beta.2] - 2026-06-30

### Changed

- Prepared the repository for public open-source release: consumer-facing README, CONTRIBUTING, DEVELOPMENT.md, and third-party dependency notices.

## [1.2.0-beta] - 2026-06-11

### Added

- **Bedrock AgentCore evaluation plugin.** New plugin (`plugin-eval-agentcore`) enables evaluation of Amazon Bedrock AgentCore agents. Custom evaluators can be defined inline in the plugin config; on each run the plugin looks up the evaluator by name and calls `UpdateEvaluator` if the remote definition has drifted from the local one, otherwise creates it.
- **Generative plugin SDK.** New package (`plugin-gen-sdk`) provides a TypeScript SDK for building generative test-case plugins, with shared types and a standardised entry-point contract. See `packages/plugin-gen-sdk/README.md` for the SDK reference and example plugin.
- **Lambda plugins.** Evaluation plugins can now run as Lambda functions inside the solution VPC, in addition to the existing container-based plugin runtime. The Lambda runtime targets shorter-running evaluators with lower cold-start overhead and simpler IAM scoping.
- **FMEval BedrockModelRunner support.** The FMEval plugin now supports `BedrockModelRunner` for advanced evaluation algorithms, expanding the range of foundation model evaluation techniques available.
- **Contribution guide.** Added `CONTRIBUTING.md` with guidance for contributors to the open-source repository.
- **Documentation site built and published from CI.** The MkDocs documentation site is now built and published as part of the CI pipeline, replacing the previous manual publication process.

### Changed

- **Default model for generation plugins updated to Claude Haiku 4.5.** Both generation plugins (RAG and LLM-as-judge test-case generation) now default to `global.anthropic.claude-haiku-4-5-20251001-v1:0`, replacing the legacy Claude 3 Haiku model. The `global.` prefix enables batch inference across all AWS regions without requiring per-region inference profile configuration.
- **Solution Guide and User Guide rewritten.** Both guides have been substantially rewritten for clarity and accuracy (Solution Guide: 1,987 → ~700 lines; User Guide: 1,999 → ~740 lines). Includes a print-friendly layout for offline use.
- **Docker images use content-addressable tags.** ECR images are now tagged with content hashes rather than mutable labels, improving deployment reproducibility and cache invalidation.
- **Plugin type interfaces simplified.** External plugin type interfaces have been refactored for clarity, reducing the surface area that plugin authors need to understand.
- **Plugin error messages include plugin name.** Error messages from plugin execution now include the plugin name, making it easier to identify which plugin failed in multi-plugin evaluations.
- **`aws-cdk-lib` upgraded to 2.237.1.** Updated to the latest CDK release for new features and fixes.
- **Single root `npm install` for the monorepo build.** The lockfile is now hoisted to the workspace root, so building from source needs only one `npm install` at the repo root rather than per-package installs. Removes a class of CI lockfile-drift failures.

### Changed (Breaking)

- **Plugin Docker build pattern updated.** Plugins using the generative SDK must now mount the SDK at `/plugin-gen-sdk` in their container and use `npm ci` with an unmodified lockfile. This replaces the previous `sed`-based path rewriting approach. Existing custom plugins require a Dockerfile update.

### Fixed

- **Schedule-triggered evaluation results retrievable.** The `GetEvaluation` API previously rejected the composite IDs (`scheduleName_evaluationId`) generated for schedule-triggered evaluations, blocking access to results. Validation now permits the underscore separator.
- **Evaluation config display from config file.** Fixed an issue where evaluation configurations loaded from file were not displayed correctly in the CLI output.
- **Empty path parameters return 400 instead of 500.** API requests with empty path parameters now return a proper 400 Bad Request rather than an internal server error.
- **`put-version-annotation` response corrected.** Fixed the response shape for the version annotation API endpoint.
- **`scheduleName` field validation in job trigger Lambda.** Fixed a Zod validation error when the `scheduleName` field was present in job schedule trigger events.
- **Built-in evaluators in experiment reporting.** Fixed support for built-in evaluators in the experiment reporting Lambda, which previously only handled plugin-based evaluators.
- **Pre-requisite Lambda memory limit increased.** Increased the memory allocation for the pre-requisite check Lambda to prevent timeout failures on larger deployments.
- **CLI `JobId` type registration.** Fixed missing type registration for `JobId` in the CLI model binding registry, which caused serialisation errors.
- **Ensure Experiment Lambda builds for the correct CPU architecture on Linux build hosts.** This avoids an issue where non x86_64 Linux hosts would build experiment-lambda with the wrong architecture for the target Lambda functions, resulting in runtime failures. x86_64 Linux CI and all Mac and Windows builders were unaffected.

### Security

- **AWS SDK v3 packages upgraded to address known vulnerabilities.** All `@aws-sdk/client-*` and related packages bumped from the `^3.7xx` range to `^3.1000+` (commit `1a9517f0`). Specific CVEs were not enumerated in commit messages; consumers running prior versions in customer environments should review their own dependency audits.
- **npm dependency vulnerabilities cleared.** Bumped transitive dependencies across CDK, CLI, deployment, plugins, and tests packages to clear all known critical and high npm advisories. Two unfixable false positives bundled in third-party tooling remain.
- **`model_args` allowlist in LLM-as-Judge plugin.** Plugin configuration now restricts `model_args` to inference-tuning parameters (`temperature`, `max_tokens`, `top_p`, `top_k`, `stop_sequences`, and similar). Disallowed keys such as `endpoint_url` or `credentials_provider` are dropped with a `WARNING` log instead of being forwarded to `ChatBedrockConverse`. See the plugin README for the full allowlist.
- **Length caps on MLflow `filter` and `orderBy` inputs.** `ListExperiments` now rejects `filter` expressions over 1024 characters, and `orderBy` lists over 8 entries × 128 characters per entry, with a `ValidationException`. Grammar validation remains delegated to MLflow's own parser.
- **Lambda principal removed from EventBridge Scheduler role trust.** The scheduler role's trust policy previously listed both `scheduler.amazonaws.com` and `lambda.amazonaws.com`; only the scheduler service ever assumes it, so the unused Lambda principal has been removed.
- **Removed undocumented `role_arn` from FMEval plugin config.** The field was never wired through to the S3 client used by the evaluator and never appeared in the README, so it has been deleted from the plugin configuration model.

## [1.1.55+b6399156287] - 2025-12-09

Last version before refactor to monorepo.

### Fixed

- **Test case score processing from S3.** Fixed direct S3 processing of test case scores, eliminating an intermediate step that could fail on large result sets.
- **Evaluator output handling.** Fixed incorrect output formatting from evaluators that could cause downstream processing failures.
- **Evaluation workflow commands.** Fixed CLI commands for managing evaluation workflows.
- **Scheduled evaluation cleanup for long-running tests.** Fixed a resource leak where long-running scheduled evaluations did not properly invoke cleanup.
- **Plugin CDK utilities exported.** Fixed missing exports for plugin CDK utility functions that plugin authors need for custom infrastructure.

### Changed

- **AWS SDK dependencies updated.** Bumped `@aws-sdk/client-*` packages from `3.921.0` to `3.939.0` and `aws-xray-sdk` from `3.11.0` to `3.12.0`.

## [1.1.38+b6391020617] - 2025-11-14

### Added

- **Customer-managed KMS key support.** Deployments can now use a customer-provided KMS key for encryption of data at rest, replacing the default AWS-managed key.
- **Optional plugin deployment configuration.** Plugin deployments can now be configured independently, allowing selective deployment of evaluation plugins.
- **`NOTICES.md` extended to new packages.** Open-source dependency attributions added to packages introduced since the previous release.
- **Experiment context in test case results.** Test case results logged to MLflow now include evaluation context metadata.
- **DatastoreTableName exported as stack output.** The DynamoDB table name is now available as a CloudFormation stack export for cross-stack references.

### Changed

- **ECS Bedrock permissions scoped globally.** Bedrock model invocation permissions for ECS tasks now use a global scope, removing the need for per-region configuration.
- **Type exports cleaned up.** Public type interfaces are now exported from a single entry point for cleaner consumption by plugin authors.
- **ARN formats standardised.** All IAM and resource ARNs now use a consistent format across the codebase.
- **Integration test speed improvements.** Test execution time reduced through parallelisation and removal of unnecessary waits.

### Fixed

- **Lambda prebundling.** Fixed Lambda prebundling to ensure all dependencies are correctly included in deployment packages.
- **Plugin timeout error messages.** Plugin timeouts now emit a clear, actionable error message instead of a generic failure.
- **Evaluation happy-path failures.** Fixed an issue where certain evaluation runs would fail silently on the happy path.
- **CLI excess arguments rejected.** The CLI now returns an error for unrecognised arguments instead of silently ignoring them.
- **Plugin SDK wheel build configuration.** Fixed missing packages specification in the Python wheel build config.
- **pip version pinned for reproducible builds.** Pinned pip to version 25.1 to prevent non-deterministic build failures.

## [1.1.6+b6385857012] - 2025-10-30

### Added

- **CLI package.** New `gen-ai-evaluation-cli` package provides a command-line interface for all evaluation and experiment operations, with Mustache-templated output formatting and auto-generated commands from the Smithy model.
- **Smithy-based API model.** The API contract is now defined in [Smithy](https://smithy.io/), enabling automated generation of the CLI, TypeScript client, and Python client from a single source of truth.
- **TypeScript plugin SDK.** New TypeScript SDK for building evaluation plugins, with standardised interfaces for plugin lifecycle and result reporting.
- **Python plugin SDK.** Python SDK for evaluation plugin development, with Hatch-based build tooling and a shared interface contract with the TypeScript SDK.
- **Python API client.** Generated Python client for the evaluation API, enabling programmatic access from Python-based workflows.
- **Experiment logger service.** ECS-based service for tracking experiment artifacts and run lifecycle via MLflow.
- **LLM-as-judge evaluation plugin.** First-party LLM-as-judge plugin implementing scoring with configurable Bedrock models and prompt-template-driven judgement criteria.
- **Experiment tracking APIs.** Added `CreateExperiment`, `GetExperiment`, and `ListExperiments` APIs with DynamoDB-backed storage and MLflow artifact logging.
- **Agentic evaluation support.** RAGAS and test-case generation plugins now support agentic evaluation scenarios with multi-tool-call test cases.

### Changed

- **Monorepo migrated from pnpm to single npm workspace.** The repository structure was consolidated from a pnpm monorepo into a single npm workspace, simplifying dependency management and build orchestration.
- **CLI auto-generated from Smithy model.** The CLI is now generated from the Smithy API model rather than hand-maintained, ensuring API parity and reducing maintenance burden.
- **Default evaluation model set to Claude 3 Haiku.** Evaluation plugins now default to Claude 3 Haiku for cost-effective scoring, replacing Nova Micro after model availability issues.
- **Plugin images distributed via ECR.** Evaluation plugin container images are now published to ECR and referenced by digest, replacing the previous S3 tarball distribution mechanism.
- **Evaluation score aggregation fixed.** The score aggregation Lambda now correctly computes aggregate metrics across evaluation runs.
- **Default `maxResults` added to all list APIs.** List endpoints now return a bounded result set by default, preventing unbounded queries.

### Changed (Breaking)

- **API model restructured for Smithy generation.** API request/response shapes were refactored to align with Smithy code generation requirements. Clients using the previous hand-crafted API types require updates.
- **Annotation schema model decoupled from Smithy.** The DynamoDB model for annotation schemas was separated from the Smithy API model, changing the internal storage format.

### Fixed

- **Evaluation run termination handler.** Fixed the termination Lambda to correctly reference the handler file after the ExperimentLambda package restructure.
- **Zod validation error on pagination.** Fixed a Zod schema error that caused pagination failures on list endpoints.
- **Experiment parameter instantiation.** Fixed incorrect experiment parameter construction that caused experiment creation failures.
- **Virtualenv 20.35.0 compatibility.** Fixed a Hatch compatibility issue triggered by virtualenv 20.35.0 that broke plugin builds.
- **pip version pinned for reproducible builds.** Pinned pip to prevent non-deterministic build failures caused by pip self-upgrade races.

### Security

- **Vulnerable dependencies updated.** Updated `setuptools>=78.1.1` to resolve a vendored LGPLv3 dependency. AWS SDK packages updated across all plugins.

## [1.0.42+b6359941117] - 2025-08-15

First fully approved release.

### Added

- **Evaluation workflow with Step Functions orchestration.** End-to-end evaluation pipeline using AWS Step Functions, with S3-based test data management, configurable expiry durations, and error-handling states that synchronise status with MLflow.
- **Evaluation plugins: RAGAS, FMEval, Generate Test Cases, LLM-as-Judge.** Four first-party evaluation plugins containerised and distributed via S3/ECR, covering retrieval-augmented generation, foundation model evaluation, synthetic test case generation, and LLM-based scoring.
- **CLI for evaluation and experiment management.** Command-line interface with commands for evaluation jobs, job schedulers, configurations, version annotations, and experiment tracking. Includes Mustache-templated output formatting.
- **Job scheduling with EventBridge.** Scheduled evaluation runs via EventBridge Scheduler, with `ListJobs` filtering by `scheduleName` and pagination support.
- **Configuration listing and management APIs.** APIs for listing, creating, and managing evaluation configurations with DynamoDB-backed auditing.
- **Experiment API (initial).** `ListExperiments` and experiment lifecycle APIs with MLflow integration for artifact tracking.
- **API Gateway access logging.** Added structured access logging to the API Gateway for operational visibility.
- **Documentation site.** Customer-facing documentation site with automated build integration.
- **`NOTICES.md` attribution files.** Open-source dependency attributions added to all published packages to fulfil licence obligations.

### Changed

- **CDK libraries use peer dependencies.** `aws-cdk-lib` and `constructs` moved to `peerDependencies` with minimum versions, improving compatibility for customers using different CDK versions.
- **esbuild added as peer dependency.** Avoids requiring Docker for Lambda bundling in customer environments.
- **Deployment-specific VPC naming.** VPC resources now use deployment-specific names and exported subnet identifiers for multi-deployment isolation.

### Fixed

- **SSL enforcement in SecuredBucket.** Fixed missing SSL transport enforcement on S3 buckets.
- **API Gateway logging role.** Fixed the IAM role configuration that prevented API Gateway from writing access logs.
- **Step Functions S3 pagination limit.** Added pagination limits to prevent unbounded S3 list operations in evaluation workflows.
- **Throttling exceptions with retry.** Added throttling exception handling and increased SDK `maxAttempts` for Bedrock and DynamoDB clients.
- **Validation errors on input.** Fixed multiple input validation issues that returned incorrect error responses.

### Security

- **Log groups retained with 18-month retention.** CloudFormation log groups now use `Retain` removal policy with 18-month retention.
- **Vulnerable dependencies patched.** Updated packages with known vulnerabilities, including pinning `pillow` for build reproducibility.
- **Unused KMS constructs removed.** Deleted dead `SecuredKey` construct and erroneous KMS references to reduce attack surface confusion.

## [Alpha+b6342564644] - 2025-06-26

Initial release reviewed within AWS.
