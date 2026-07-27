# GenAI-ETK Terraform module

The Terraform constructs library[^constructs] for the Gen AI Evaluation Toolkit — API Gateway, Lambda, DynamoDB, S3, Step Functions, ECS, EventBridge, networking, IAM. Product equivalent of `packages/cdk/`: same infrastructure, different IaC tool.

[^constructs]: "Constructs library" = a set of reusable, composable Terraform modules consumers instantiate from their own root module (analogous to AWS CDK constructs). This package is the library; the deploy harness lives in [`packages/terraform-deployment/`](../terraform-deployment/README.md).

This package is the **constructs library** — composable Terraform modules consumers call from their own deployment harness. The monorepo's deploy-time wrapper is at [`packages/terraform-deployment/`](../terraform-deployment/README.md).

> **Two packages, why?** `packages/terraform/` is the customer-facing library (no backend, no environment-specific values, no scripts). `packages/terraform-deployment/` is the monorepo's own deploy harness — backend.hcl, plugin registry, ECR bootstrap, CI scripts. **Customers consuming the library do not need `terraform-deployment/`**; they wire their own root + backend and call this module via `module "etk" { source = ... }`.

## Layout

```text
main.tf, variables.tf, outputs.tf   # Public input/output contract
tests/                              # tftest.hcl validation (mock provider, no AWS)
modules/
├── common/        # VPC + subnets + endpoints, API GW, shared IAM, EventBridge
├── datastore/     # DynamoDB single-table + S3 buckets + dataset/result Lambdas
├── evaluation/    # SDKV2 evaluator: DynamoDB table, orchestration SFN,
│                  #   Python API Lambda, evaluator-builtin Docker Lambda,
│                  #   EventBridge task routing, scheduler CRUD (TypeScript)
├── experiment/    # Experiment management API + MLflow tracking
├── generation/    # Step Functions generation workflow + ECS generator plugins
├── plugins/{lambda,ecs,iam}/   # Reusable building blocks for plugin types
└── telemetry/     # CloudWatch dashboard and alarms
```

`evaluation` implements the SDKV2 architecture: a dedicated DynamoDB table (single-table design), an orchestration Step Functions state machine (uses EventBridge `putEvents.waitForTaskToken` to dispatch scoring tasks), a single EvaluatorApiLambda (Python, handles all `/v2/` routes), three async Python Lambdas (post-processing, internal-handler, scheduler-trigger), a consolidated `evaluator-builtin` Docker Lambda (replaces the old separate ragas / llm-as-judge / agentcore ECS plugins), and scheduler CRUD TypeScript Lambdas (one per operation, unchanged from v1). `generation` composes `modules/plugins/{lambda,ecs,iam}` to wire each plugin (per-plugin IAM role, Lambda or ECS task, log group with CMK).

The module declares no backend — callers are responsible for adding a `terraform { backend "<type>" {} }` block in their root module. The monorepo's `packages/terraform-deployment/` wraps this module with an S3 + DynamoDB backend; customers using the module standalone do the same in their own root.

## How to consume

**Minimal:** the inputs you'll typically set are `project_name`, `environment`, and `deployed_image_uris` (one entry per enabled generation plugin). `project_name` and `environment` default to `etk` / `dev` (see [Configuration](#configuration)); `deployed_image_uris` defaults to `{}`, so set one entry per enabled generation plugin. Defaults give you ETK-managed VPC, AWS-managed encryption, and the built-in evaluator.

```hcl
module "etk" {
  source = "git::<YOUR_REPO_URL>//packages/terraform"

  project_name = "etk"
  environment  = "dev"

  # Required: image URIs for every enabled container. Map of deploy_key → <repo>:<tag>.
  # Include the `evaluator-builtin` key to deploy the consolidated SDKV2 scorer.
  deployed_image_uris = {
    "plugin-gen-bedrock" = "12345.dkr.ecr.eu-west-2.amazonaws.com/.../bedrock:v1.0"
    "evaluator-builtin"  = "12345.dkr.ecr.eu-west-2.amazonaws.com/.../evaluator-builtin:v2.0"
  }
}
```

**With optional advanced features** (existing VPC, BYOK, custom plugin selection):

```hcl
module "etk" {
  source = "git::<YOUR_REPO_URL>//packages/terraform"

  project_name       = "etk"
  environment        = "dev"
  aws_region         = "eu-west-2"
  encryption_key_arn = "arn:aws:kms:..."          # BYOK — optional
  use_existing_vpc                = true          # existing VPC — optional
  existing_vpc_id                 = "vpc-0abc123"
  existing_api_gw_vpc_endpoint_id = "vpce-0abc123" # required with existing VPC — see existing VPC section

  generation_plugins = { ... }

  deployed_image_uris = {
    "plugin-gen-bedrock" = "12345.dkr.ecr.eu-west-2.amazonaws.com/.../bedrock:v1.0"
    "evaluator-builtin"  = "12345.dkr.ecr.eu-west-2.amazonaws.com/.../evaluator-builtin:v2.0"
  }
}
```

**With new features** (agent-as-judge evaluator, AI Gateway, private-only API, existing VPC isolated subnets):

The AI Gateway is an optional OAuth2-fronted LLM gateway (Bedrock Converse-compatible): when `gateway_config` is set, the builtin evaluator's model calls are routed through a centrally-governed endpoint (OAuth2 auth, secret in Secrets Manager) instead of calling Amazon Bedrock directly, giving org-wide cost tracking and budget enforcement. It is fully opt-in (`null` disables). See [AI Gateway integration](../../docs/solution_guide/Gen-AI-ETK-SolutionGuide.md#ai-gateway-integration-optional) in the Solution Guide.

```hcl
module "etk" {
  source = "git::<YOUR_REPO_URL>//packages/terraform"

  project_name = "etk"
  environment  = "prod"

  # Private-only API: no public (EDGE/REGIONAL) API is created. The private API
  # (always created, VPC-restricted) is the only Gateway. See API Gateway below.
  public_endpoint_type = "DISABLED"

  # Route the builtin evaluator's LLM calls through the AI Gateway.
  gateway_config = {
    gateway_endpoint  = "https://gateway.example.internal"
    token_endpoint    = "https://gateway.example.internal/oauth2/token"
    client_id         = "my-oauth-client-id"
    client_secret_arn = "arn:aws:secretsmanager:eu-west-2:12345:secret:ai-gateway-client-secret"
    model_id          = "anthropic.claude-3-5-sonnet"
  }

  # existing VPC: isolated (no-internet) subnets the agent-as-judge evaluator runs in,
  # plus the existing execute-api interface endpoint the private REST API binds to.
  use_existing_vpc                = true
  existing_vpc_id                 = "vpc-0abc123"
  existing_private_subnet_ids     = ["subnet-0priv1", "subnet-0priv2", "subnet-0priv3"]
  existing_isolated_subnet_ids    = ["subnet-0iso1", "subnet-0iso2", "subnet-0iso3"]
  existing_api_gw_vpc_endpoint_id = "vpce-0abc123"

  # Enable the builtin + agent-as-judge evaluators by providing their images.
  # Neither is a dedicated variable — both are keyed into deployed_image_uris.
  deployed_image_uris = {
    "plugin-gen-bedrock"       = "12345.dkr.ecr.eu-west-2.amazonaws.com/.../bedrock:v1.0"
    "evaluator-builtin"        = "12345.dkr.ecr.eu-west-2.amazonaws.com/.../evaluator-builtin:v2.0"
    "evaluator-agent-as-judge" = "12345.dkr.ecr.eu-west-2.amazonaws.com/.../evaluator-agent-as-judge:v2.0"
  }
}
```

State backend: declared by the caller, not by this module. The monorepo's `packages/terraform-deployment/backend.tf` declares a partial S3 backend (`encrypt = true` only); concrete values come via `terraform init -backend-config=...`.

## Setup

```shell
mise install            # nodejs, terraform, tflint
mise run install-all    # workspace dependencies + generated packages
nx run cdk:build        # produces the Lambda zips this module needs at apply time
```

## Build and test

```shell
nx run terraform:stage-assets   # stage Lambda zips into assets/lambda/ (monorepo build step — see note below)
nx run terraform:validate       # init -backend=false && terraform validate
nx run terraform:test           # terraform test against tests/*.tftest.hcl (mock provider)
```

> `stage-assets` is the monorepo's own build glue — it copies the zips produced by `experiment-lambdas:build` and `cdk:build` into `packages/terraform/assets/lambda/` so the module's `data "archive_file"` resources can find them. The zips are gitignored, so they are **not** part of the module source you fetch via `git::` — consumers cloning the repo (or vendoring this module into a release pipeline) need an equivalent step that produces `assets/lambda/Lambda.zip` and `assets/lambda/nodejs-handlers.zip` before `terraform plan`. See `packages/terraform-deployment/` for the monorepo's wiring.

### Code quality

```shell
nx run terraform:fmt            # terraform fmt -check -recursive
nx run terraform:lint           # tflint --recursive
nx run terraform:checkov        # security scan; MEDIUM+ blocks
```

### Clean

```shell
nx run terraform:clean          # remove .terraform/, staged Lambda zips
```

### Testing

`nx run terraform:test` exercises 8 `.tftest.hcl` suites under `tests/` against a mock AWS provider — no credentials required, no real plan/apply. Coverage:

| Suite                                       | Validates                                                                              |
| ------------------------------------------- | -------------------------------------------------------------------------------------- |
| `existing_vpc_validation.tftest.hcl`              | `use_existing_vpc` wiring: subnets, SGs, endpoint reachability checks                  |
| `cmk_validation.tftest.hcl`                 | `encryption_key_arn` threading on S3, DynamoDB, log groups, SQS, EventBridge DLQ       |
| `common_validation.tftest.hcl`              | Core resource counts, naming conventions, tag propagation                              |
| `deployed_image_uris_validation.tftest.hcl` | Plugin image URI map → ECS/Lambda task definitions                                     |
| `evaluation_validation.tftest.hcl`          | SDKV2 evaluation: DynamoDB table, orchestration SFN, Python Lambdas, evaluator-builtin |
| `generation_validation.tftest.hcl`          | Generation Step Functions + ECS plugin wiring                                          |
| `security_hardening_validation.tftest.hcl`  | S3 SSL-only policies, public-access blocks, lifecycle cleanup, per-Lambda IAM roles, X-Ray, log retention |
| `telemetry_validation.tftest.hcl`           | CloudWatch dashboard + alarms creation and gating                                      |

For deploy-time commands (`plan`, `apply`, `bootstrap-*`, image push, seed-test-data) see [`packages/terraform-deployment/README.md`](../terraform-deployment/README.md).

## Configuration

Root inputs in [`variables.tf`](./variables.tf); per-module inputs in `modules/<name>/variables.tf`. Variables you typically set:

| Variable                                                                     | Default                 | Notes                                                                                                    |
| ---------------------------------------------------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------- |
| `aws_account_id` / `aws_region`                                              | `""` (auto)             | Auto-derived from `aws_caller_identity` / provider region.                                               |
| `project_name` / `environment`                                               | `etk` / `dev`           | Used in resource names. Bootstrap derives `genai-<project_name>` for state bucket and lock table.        |
| `vpc_cidr`                                                                   | `10.0.0.0/16`           | Used only when `use_existing_vpc = false`.                                                               |
| `enable_xray`                                                                | `true`                  | X-Ray on Lambdas, API GW, Step Functions.                                                                |
| `log_level`                                                                  | `INFO`                  | One of `DEBUG`, `INFO`, `WARN`, `ERROR`.                                                                 |
| `log_retention_days`                                                         | `null` → 545            | 18 months matches CDK pentest sign-off.                                                                  |
| `enable_cloudwatch_alarms` / `enable_observability`                          | `true` / `true`         | In-account alarms + dashboard.                                                                           |
| `alarm_sns_topic_arn`                                                        | `null`                  | Optional alarm sink.                                                                                     |
| `public_endpoint_type`                                                       | `EDGE`                  | Public API Gateway endpoint type: `EDGE`, `REGIONAL`, or `DISABLED` (private-only). The private API is always created. See [API Gateway](#api-gateway-dual-api). |
| `use_existing_vpc` + `existing_*_subnet_ids` / `existing_security_group_ids` | `false` / `[]` / `{}`   | existing VPC mode. `existing_*_subnet_ids` includes `existing_isolated_subnet_ids` (see [existing VPC](#existing_vpc)).    |
| `existing_isolated_subnet_ids`                                               | `[]`                    | existing VPC only: isolated (no-internet) subnet IDs for the always-deployed agent-as-judge evaluator. Required (≥2, distinct AZs) when `use_existing_vpc = true`; see [existing VPC](#existing_vpc).                  |
| `existing_api_gw_vpc_endpoint_id`                                            | `null`                  | existing VPC only: ID of an existing execute-api interface VPC endpoint (`vpce-...`) the private REST API binds to. Required when `use_existing_vpc = true` — ETK creates no VPC endpoints when using an existing VPC; see [existing VPC](#existing_vpc). |
| `encryption_key_arn`                                                         | `null`                  | Customer-managed KMS key for at-rest encryption.                                                         |
| `gateway_config`                                                             | `null`                  | Optional AI Gateway for the builtin evaluator — object `{ gateway_endpoint, token_endpoint, client_id, client_secret_arn, model_id, scope? }` (`scope` = optional OAuth2 scope(s) for the token request). Routes its LLM calls through the gateway. |
| `evaluation_plugins`                                                         | (CDK-mirrored defaults) | Map of evaluator name → `{ enabled, type, ... }`. Controls which evaluator plugins are deployed.         |
| `generation_plugins`                                                         | (CDK-mirrored defaults) | Map of plugin name → `{ enabled, type, ... }`.                                                           |
| `deployed_image_uris`                                                        | `{}`                    | Map of `deploy_key` → `<repo>:<tag>` for every container image. Required for any enabled plugin without inline `image_uri`. The consolidated builtin evaluator and the agent-as-judge evaluator are enabled by providing the `evaluator-builtin` and `evaluator-agent-as-judge` keys respectively (when a key is absent that evaluator is not created). |
| `tags`                                                                       | `{}`                    | Additional tags on every resource.                                                                       |
| `access_logs_retention_days` *(common module)*                               | `30`                    | Days before access-log objects expire. Mirrors CDK `SecuredBucketProps.accessLogsRetentionDays`. Override with longer retention for production. |
| `mlflow_artifacts_noncurrent_expiry_days` *(experiment module)*              | `90`                    | Days before noncurrent MLflow artifact versions expire. Mirrors CDK `SecuredBucketProps.noncurrentVersionExpiryDays` on the MLflow bucket. |

### API Gateway (dual-API)

Mirrors CDK's dual-API model. Two REST APIs back the same Lambda handlers:

- **Private API** — always created. `EndpointType = PRIVATE`, bound to the
  execute-api interface VPC endpoint, IAM auth, and a **DENY-only** resource
  policy that rejects any request whose `aws:SourceVpc` is not the deployment
  VPC. In-VPC callers (the evaluators, generation plugins, agent-as-judge) use
  this API. The condition keys on `aws:SourceVpc` (the whole VPC) rather than
  `aws:sourceVpce` (a specific endpoint ID), so any ENI in the VPC clears the
  resource policy — a deliberately broad trust boundary that mirrors CDK.
  Per-caller least-privilege is enforced by IAM instead: each Lambda role is
  granted `execute-api:Invoke` scoped to only the routes it needs (e.g.
  agent-as-judge's 6 routes), so the resource policy gates *"is this from our
  VPC?"* while IAM decides *"which routes may this principal call?"*.
- **Public API** — optional, controlled by `public_endpoint_type`:
  - `EDGE` (default) — edge-optimized public endpoint.
  - `REGIONAL` — regional public endpoint.
  - `DISABLED` — no public API; private-only deployment (single Gateway).

  When present, the public API's invoke URL is published to SSM
  `/genai-etk/restApiEndpoint` (what external clients / the CLI read); with
  `DISABLED` the private URL is published instead.

Every route is registered on both APIs, so there is no behavioural difference
between them beyond reachability. Validation: `tests/common_validation.tftest.hcl`,
`tests/evaluation_validation.tftest.hcl`.

### CMK encryption (`encryption_key_arn`)

When set, threaded to:

- S3 buckets (`kms_master_key_id` on `aws_s3_bucket_server_side_encryption_configuration`)
- DynamoDB tables
- SQS DLQs
- Every CloudWatch log group (including the vendored telemetry submodule)
- Step Functions logs
- EventBridge DLQ

**Limitation:** Lambda environment variables still use AWS-managed encryption — the CMK is **not** threaded onto `aws_lambda_function` resources. Matches CDK's `SecuredNodejsFunction` (no CMK on env vars there either). Tracked as a cross-cutting hardening follow-up. Lambda env vars hold only resource names/ARNs — no secrets.

Required key policy: see the [AWS Logs CMK guide](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/encrypt-log-data-kms.html). Validation: `tests/cmk_validation.tftest.hcl`.

### existing VPC

`use_existing_vpc = true` skips VPC/subnet/NAT creation. Existing VPC must provide outbound reachability via NAT or VPC endpoints (`s3`, `dynamodb`, `ecr.api`, `ecr.dkr`, `logs`, `sqs`, `states`, `lambda`, `bedrock-runtime`, `ssm`, `secretsmanager`).

**execute-api VPC endpoint.** The private REST API (always created) must bind to
an execute-api **interface** VPC endpoint. ETK creates no VPC endpoints on
existing VPC, so you **must** supply an existing one via
`existing_api_gw_vpc_endpoint_id` (private DNS enabled; its security group must
allow inbound :443 from the Lambda/ECS security groups). A plan-time validation
fails fast if it is omitted when `use_existing_vpc = true`.

Use `existing_security_group_ids` to attach pre-existing security groups to Lambda and ECS resources instead of the module-created defaults. This is useful when your organisation mandates centralised SG management or needs specific ingress/egress rules that differ from the module's defaults (allow-all-egress, no ingress):

```hcl
existing_security_group_ids = {
  lambda = "sg-0abc123..."   # attached to all Lambda functions
  ecs    = "sg-0def456..."   # attached to ECS tasks
}
```

Both keys are optional — omit either to keep the module-managed SG for that resource type. Validation: `tests/existing_vpc_validation.tftest.hcl`.

**Isolated subnets for agent-as-judge.** The agent-as-judge evaluator is always
deployed and runs in network-isolated subnets (no internet route) enforced by a
runtime network guard. In existing VPC mode you **must** supply these via
`existing_isolated_subnet_ids` — at least 2 across distinct AZs, with **no**
IGW/NAT route, but with reachability to the interface VPC endpoints it needs
(`bedrock-runtime`, `events`, `logs`, `cloudwatch`, `execute-api`) and the S3
gateway endpoint. ETK does not create these when using an existing VPC — you own their routing
and endpoint connectivity. A plan-time validation fails fast if fewer than 2 are
provided when `use_existing_vpc = true`. (In module-managed VPC mode the module
creates these isolated subnets automatically.)

### Plugins

`generation_plugins` accepts `map(plugin_name -> object)` -- see `variables.tf` for the schema. Each plugin's image URI is resolved from `var.deployed_image_uris[<deploy_key>]` unless overridden inline via `image_uri`. Default sets mirror CDK's `external-plugins.ts`.

Example -- disable the RAG plugin and add a custom one:

```hcl
generation_plugins = {
  # Keep defaults but disable RAG
  genRagPlugin        = { enabled = false, type = "ecs" }
  # Add a custom Lambda plugin
  myCustomPlugin      = { enabled = true, type = "lambda", handler = "index.handler" }
}
```

`evaluation_plugins` follows the same schema for evaluator plugins. Default deploys `evaluator-builtin` (Lambda-based, consolidates LLM-as-Judge, RAGAS, and AgentCore scorers) and `evaluator-agent-as-judge`.

The evaluation module no longer uses a multi-plugin architecture. The `evaluator-builtin` Docker Lambda consolidates all built-in scoring logic (LLM-as-Judge, RAGAS, AgentCore) into a single image, supplied via the `evaluator-builtin` key in `deployed_image_uris`.

### Observability

`enable_observability = true` (default) creates a CloudWatch dashboard + comprehensive alarm set for in-account operational monitoring. Set to `false` to skip.

## Security hardening

Achieves parity with CDK's `SecuredBucket`, `SecuredNodejsFunction`, and API GW hardening constructs:

| Control                    | Implementation                                                           |
| -------------------------- | ------------------------------------------------------------------------ |
| Private API VPC restriction | Private API (always created) carries a DENY-only resource policy rejecting requests whose `aws:SourceVpc` is not the deployment VPC; the public API is created by default (`public_endpoint_type = EDGE`) — set it to `DISABLED` for a private-only deployment |
| S3 access logging          | Shared access-logs companion bucket (`modules/common/s3-access-logs.tf`) |
| S3 lifecycle cleanup       | Delete-marker cleanup + noncurrent version expiry on every bucket; access-logs versioning suspended |
| API GW access logs         | Dedicated CloudWatch log group, CLF format                               |
| X-Ray tracing              | Active across Lambdas + API GW stage + Step Functions                    |
| OTEL sidecar (ECS plugins) | ADOT collector container (gated on `enable_otel_sidecar`)                |
| S3 SSL-only                | `DenyInsecureTransport` policy on every bucket                           |
| Per-function IAM roles     | Each Lambda has its own least-privilege role                             |
| CMK on log groups          | All log groups thread `kms_key_id = var.encryption_key_arn`              |

## License

Licensed under Apache-2.0. See the [LICENSE](../../LICENSE) file at the repository root.
