# GenAI-ETK Terraform deployment

The deploy-time wrapper around `packages/terraform/` (the customer constructs library). Mirrors the CDK split — this package is to `packages/terraform/` what `packages/deployment/` is to `packages/cdk/`. **Internal**: customers consuming the constructs library don't need it.

## Layout

```text
main.tf, variables.tf      # Instantiates packages/terraform/, supplies image URIs
backend.hcl(.example)      # Generated per AWS profile by scripts/gen-backend-hcl.sh
terraform.tfvars           # Per-environment overrides
plugins.yaml               # Plugin registry — bootstrap ECR + CI matrix source of truth
bootstrap/                 # One-time per-account: state backend, ECR repos, SSM
scripts/                   # common.sh, gen-backend-hcl.sh, gen-pipeline.ts,
                           # preflight-bootstrap.sh, seed-placeholder-images.sh,
                           # build-and-push-images.sh, set-image-tag.sh, seed-test-data.sh
```

## Setup

```shell
mise install            # nodejs, terraform, tflint
mise run install-all    # workspace dependencies + generated packages
```

Set `AWS_PROFILE` **and** `AWS_DEFAULT_REGION` for your target account in `mise.local.toml` (gitignored). The deploy scripts read the region from `AWS_DEFAULT_REGION` / `AWS_REGION` — a region configured only in your AWS profile is **not** picked up.

```toml
# mise.local.toml
[env]
AWS_PROFILE        = "your-profile"
AWS_DEFAULT_REGION = "eu-west-2"
```

> **First-time checkout:** if `mise run install-all` fails with an `nx ... MODULE_NOT_FOUND` error, run `mise run install` once to fully populate `node_modules`, then re-run `mise run install-all`.

## Bootstrap (first-time per account)

```shell
nx run terraform-deployment:bootstrap-plan      # plan: state backend, ECR, SSM
nx run terraform-deployment:bootstrap-apply     # apply
```

> You need to run bootstrap only once per account.

Bootstrap creates resources prefixed with `genai-<project_name>` (default: `genai-etk`).
Override `project_name` (via `TF_VAR_project_name`) to run multiple independent
ETK stacks in the same account — each gets its own state bucket, lock table,
ECR repos, and SSM parameter.

The principal running bootstrap needs admin-equivalent permissions because it
creates an S3 bucket with KMS, a DynamoDB table, ECR
repositories, and an SSM parameter. Minimum policy actions:

- `s3:CreateBucket`, `s3:PutBucketVersioning`, `s3:PutBucketEncryption`, `s3:PutBucketPolicy`, `s3:PutBucketPublicAccessBlock`
- `dynamodb:CreateTable`, `dynamodb:DescribeTable`, `dynamodb:TagResource`
- `ecr:CreateRepository`, `ecr:PutLifecyclePolicy`, `ecr:SetRepositoryPolicy`, `ecr:TagResource`
- `kms:CreateKey`, `kms:CreateAlias`, `kms:PutKeyPolicy`
- `ssm:PutParameter`, `ssm:AddTagsToResource`

`AdministratorAccess` is sufficient. For locked-down accounts, attach the
above as a custom inline policy.

After bootstrap, register the GitLab IAM role ARN (created separately) in GitLab CI:
**Settings → CI/CD → Variables** → `AWS_CREDS_TARGET_ROLE_<ENV>` = `arn:aws:iam::<account>:role/GitLab` (Protected: yes; Masked: no).

### Troubleshooting bootstrap

If `bootstrap-apply` exits with `EntityAlreadyExists` on a partially-bootstrapped account (e.g. a previous run failed mid-apply), import the existing resources rather than deleting them:

```bash
cd packages/terraform-deployment/bootstrap
terraform import aws_s3_bucket.tf_state genai-<project_name>-terraform-state-<account-id>  # default: genai-etk-terraform-state-...
terraform plan    # confirm no destructive diff, then apply
```

`describe-images` / `describe-repositories` errors classed as `UnrecognizedClientException` / `ExpiredToken` typically mean stale credentials — refresh with your auth tool (`ada credentials update` / `aws sso login`) and retry.

**VPC/Networking errors** — if `plan` or `apply` fails with subnet or VPC-related errors, ensure the VPC ID and subnet IDs in your `terraform.tfvars` exist in the target region and have appropriate route tables and NAT gateway access for Lambda/ECS.

**KMS/CMK errors** — `AccessDeniedException` on KMS operations means the deploying principal lacks `kms:CreateGrant` or `kms:Decrypt` on the customer-managed key. Verify the key policy allows the deployment role.

**Existing-VPC mode** — when `use_existing_vpc = true`, all referenced subnet IDs must belong to the specified VPC. Cross-VPC references cause `InvalidParameterValue`. Confirm with `aws ec2 describe-subnets --subnet-ids <ids> --query 'Subnets[].VpcId'`.

## Deploy

> **Picking up model/SSDK changes:** if Smithy models or the generated SSDK have changed, clear the NX cache and rebuild:
> ```shell
> npx nx reset
> nx run cdk:build
> ```
> Without this, `nodejs-handlers.zip` and `python-api.zip` may contain stale
> SSDK server code that rejects new API request shapes.

**Quick start:** `nx run terraform-deployment:build-all-images` builds Lambda zips, prepares wheels, and pushes Docker images in one command.

```shell
nx run cdk:build                                    # produces Lambda zips
nx run evaluator-builtin:prepare-wheels             # copies SDK + python-client wheels into .wheels/
nx run terraform-deployment:build-and-push-images   # builds Docker images + pushes to ECR (~15-30 min)
nx run terraform-deployment:plan                    # writes tfplan
nx run terraform-deployment:apply                   # consumes tfplan
nx run terraform-deployment:seed-test-data          # optional — only if running integration tests
```

> For infrastructure-only validation (no plugin execution), replace the
> `prepare-wheels` + `build-and-push-images` steps with
> `nx run terraform-deployment:seed-placeholder-images` (pushes busybox, ~30s).

The `prepare-wheels` step builds `evaluator-sdk` and `generated-python-client`
wheels and copies them into `packages/evaluator-builtin/.wheels/`. The
`evaluator-builtin` Dockerfile COPYs these wheels at build time. Without this
step, `docker build` for `evaluator-builtin` fails with missing `.whl` files.

> In CI, NX dependency chains handle the ordering automatically via
> `evaluator-builtin:docker:build → prepare-wheels → [evaluator-sdk:build, generated-python-client:build]`.
> The manual steps above are only needed for local deploys because
> `build-and-push-images.sh` invokes `docker build` directly without NX orchestration.

`plan` depends on `terraform:stage-assets` (stages the CDK-built Lambda zips — `Lambda.zip`, `nodejs-handlers.zip`, and `python-api.zip` — into `packages/terraform/assets/lambda/`), `gen-backend-hcl` (templates `backend.hcl` from caller's AWS profile), and `preflight-bootstrap.sh` (verifies the account has been bootstrapped).

The SDKv2 `python-api.zip` package backs the four evaluator Lambdas (`evaluator-api`, `evaluator-post-processing`, `evaluator-internal-handler`, `evaluator-scheduler-trigger`). Terraform uploads it to the shared `lambda_code` bucket under a **content-addressed key** (`lambda/python-api-<hash>.zip`) and the Lambdas reference that key — so a new build always deploys new code and a missing upload fails loud (`NoSuchKey`) rather than silently serving a stale object. No manual S3 upload step is required; `nx run cdk:build` produces the zip and `stage-assets` (run by `plan`) stages it.

### Placeholder vs real images

> ⚠️ **Placeholder images cannot execute plugin logic.** `seed-placeholder-images` pushes `busybox` to every plugin ECR repo so Lambda/ECS resources deploy and infrastructure-only checks pass — but if anything actually invokes a plugin (the `evaluator-builtin` Docker Lambda, generation ECS tasks, long-eval / long-gtg integration tests, `evaluate` / `generate` API calls), it will fail. Use real images via `build-and-push-images` for any workload exercise.

### Local development cycle

```shell
nx run terraform-deployment:fmt        # fmt -check -recursive
nx run terraform-deployment:lint       # tflint
nx run terraform-deployment:validate   # init -backend=false && terraform validate
nx run terraform-deployment:clean      # remove .terraform/, tfplan, generated backend.hcl
```

### Switching AWS profiles

```shell
nx run terraform-deployment:bootstrap-clean   # wipes bootstrap's local state
# update AWS_PROFILE in mise.local.toml, then re-run bootstrap-plan/apply
```

### Recovering an interrupted apply

If `apply` is killed mid-run (Ctrl-C, lost credentials, CI timeout), recover in this order:

1. **Push `errored.tfstate` first.** If Terraform couldn't persist state at exit, it writes `errored.tfstate` to the working directory. Before doing *anything* else, run `terraform state push errored.tfstate` — otherwise the remote state is missing everything the interrupted run created, and the next apply tries to re-create resources that already exist.
2. **Stale state lock.** A `Error acquiring the state lock` failure after an interrupted run usually means the dead process still holds the lock. Verify the holder (the lock info printed by Terraform includes ID, who, and created time; you can also inspect the `genai-etk-terraform-locks` DynamoDB table) — then release it with `terraform force-unlock <lock-id>`. Only force-unlock if you're sure no other apply is running.
3. **Orphaned resources.** `... already exists` errors on the next apply mean a resource was created but never recorded in state (and step 1 was missed or didn't cover it). Either delete the orphan in AWS and re-apply, or import it into state. Note: `terraform import` currently fails on this configuration because the telemetry module uses a computed `for_each` (Terraform cannot evaluate it at import time), so **delete-and-reapply is the reliable path**.
4. **Tainted-but-healthy resources.** An interrupted apply can leave a resource marked tainted even though it finished creating. If the resource is healthy, `terraform untaint <address>` to avoid a needless destroy/create. This matters most for the SageMaker MLflow tracking server: its deletion holds the ARN for 15-20 minutes, so a taint-driven replace fails or hangs on recreation. If you do have to recreate it, poll `aws sagemaker describe-mlflow-tracking-server` until it returns `ResourceNotFound` before re-applying.

## Adding a new plugin

> **Note:** The evaluation module no longer uses separate per-plugin ECS tasks. SDKV2 consolidates all built-in scorers (RAGAS, LLM-as-Judge, AgentCore) into a single `evaluator-builtin` Docker Lambda. The plugin registry below applies only to generation plugins.

1. Drop `packages/<plugin>/Dockerfile` (or multiple `*.Dockerfile` variants).
2. Append to `plugins.yaml`.
3. `mise run gen-pipeline` — commits both files together.
4. Add new `deploy_key` to `packages/terraform/modules/generation/plugins.tf` `_resolve_image`.
5. `nx run terraform-deployment:bootstrap-apply` to create the new ECR repo.

CI's `ci:verify-generated` job fails the build if `plugins.yaml` and the generated matrix drift.

## NX targets reference

`packages/terraform-deployment/project.json` defines the targets below. Run via `nx run terraform-deployment:<target>`. Caller-facing daily-driver targets are `plan` / `apply`; the rest are first-time setup (`bootstrap-*`), image-population helpers, or local lint/clean.

| Target                    | Purpose                                                                                      | When to use                                                           |
| ------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `bootstrap-plan`          | `terraform plan` against `bootstrap/` (state backend, ECR, SSM placeholder)             | First-time setup of a new AWS account                                 |
| `bootstrap-apply`         | `terraform apply` of the bootstrap plan                                                      | Follow-up to `bootstrap-plan` after review                            |
| `bootstrap-clean`         | Delete bootstrap's local `.terraform/` + tfplan + tfstate                                    | Switching the harness to a different AWS profile                      |
| `gen-backend-hcl`         | Render `backend.hcl` from current AWS profile                                                | Auto-runs as part of `plan`; rarely invoked directly                  |
| `seed-placeholder-images` | Push `busybox` to every plugin ECR repo + write placeholder image manifest (~30 s)           | Smoke-test infra apply without real plugin code                       |
| `build-and-push-images`   | Build each plugin from `packages/<plugin>/Dockerfile` with content-hash tag (~15-30 m)       | Required before integration tests / long-eval workflows               |
| `plan`                    | Stage Lambda zips → init backend → `terraform plan -out=tfplan`                              | Daily driver — preview infra changes                                  |
| `apply`                   | `terraform apply -auto-approve tfplan`                                                       | Daily driver — execute the reviewed plan                              |
| `seed-test-data`          | Populate DynamoDB + S3 with fixtures used by `tests-ts:test:long-*` (requires prior `apply`) | Optional — only before integration test runs                          |
| `validate`                | `init -backend=false && terraform validate`                                                  | Quick syntax/schema check without touching the backend                |
| `fmt`                     | `terraform fmt -check -recursive`                                                            | CI gate; run locally before commit                                    |
| `lint`                    | `tflint`                                                                                     | CI gate; run locally before commit                                    |
| `scripts:test`            | Bats tests for `scripts/*.sh` helpers                                                        | Touched a deploy script — verify before pushing                       |
| `clean`                   | Remove `.terraform/`, `tfplan`, `tf-outputs.json`, `backend.hcl`                             | Reset local state when switching environments or after a failed apply |

`packages/terraform/`'s `project.json` adds module-only targets (`stage-assets`, `validate`, `test`, `fmt`, `lint`, `checkov`, `clean`) — see [`packages/terraform/README.md`](../terraform/README.md#testing) for those.

> `mise run gen-pipeline` is **not** an NX target — it's a mise task that regenerates `.gitlab/generated/docker-plugin-matrix.yml` from `plugins.yaml`. Run it after editing `plugins.yaml` (see [Adding a new plugin](#adding-a-new-plugin)). CI's `ci:verify-generated` job fails the build if the regenerated output drifts from what's committed.

## State backend + image manifest

State: S3 bucket `genai-etk-terraform-state-<account-id>` under key `etk/<env>/terraform.tfstate`, locked by DDB `genai-etk-terraform-locks`. `backend.hcl` is regenerated per AWS profile — don't edit by hand.

Plugin image URIs pin via SSM `/genai-etk/<TF_ENV>/deployed-image-manifest` — a JSON object mapping each plugin's `deploy_key` to its fully-qualified `<repo>:<tag>` image URI. Bootstrap seeds an empty `{}` placeholder. The manifest is overwritten by:

- **`set-image-tag.sh` (CI)**: maps every plugin to `<repo>:$CI_COMMIT_SHORT_SHA` (single tag, set after the kaniko `docker:plugin` matrix pushes).
- **`build-and-push-images.sh` (local)**: maps every plugin to `<repo>:etk-<12-char-content-hash>`. Same content → same tag (idempotent), so retries skip the ECR push entirely. Mirrors CDK's content-hash convention from `pre-reqs.ts`.

`terraform apply` reads whatever manifest is currently pinned via `data "aws_ssm_parameter"` + `jsondecode()` and supplies it to the customer module via `deployed_image_uris`.

> The CI `docker:plugin` job (kaniko, fanned out from `plugins.yaml`) is dual-purpose: it writes the tar artifact CDK's `deploy:beta` flow consumes **and** pushes to the per-plugin ECR repo so `tf:apply` can resolve `<repo>:$CI_COMMIT_SHORT_SHA` via SSM. One build, two consumers — that's why the kaniko matrix runs even on TF-only changes.

## Beta-account specifics

CI deploys to the beta AWS account (`<YOUR_ACCOUNT_ID>`) in `eu-west-2` with `TF_ENV=tf-beta` (historical SSM-path continuity). The beta account ID and jump-role ARN are supplied via CI/CD variables referenced in `.gitlab/pipeline.yml` (`AWS_CREDS_TARGET_ROLE_TF_BETA`).

## Tearing down (disaster recovery only)

Run `terraform destroy` in the **reverse** order of deploy. Skipping this
order leaves orphaned resources and broken state:

1. **App stack first** — `cd packages/terraform-deployment && terraform destroy`.
   This removes the customer module's API Gateway / Lambda / DynamoDB / SQS / SFN
   resources (including the SDKV2 evaluator-builtin Docker Lambda and orchestration
   state machine). The bootstrap-owned ECR repos, state bucket, and SSM
   manifest stay intact (they're managed by the bootstrap stack).
2. **Empty the ECR repos** — `bootstrap-apply` created the repos with
   `force_delete = false` (CKV_AWS_51 immutable tags). They must be empty
   before `terraform destroy` will remove them:
   ```bash
   for REPO in $(yq '.plugins[].ecr_repo' plugins.yaml); do
     aws ecr batch-delete-image --repository-name "$REPO" \
       --image-ids "$(aws ecr list-images --repository-name "$REPO" --query 'imageIds[*]' --output json)" || true
   done
   ```
3. **Empty the state bucket** — versioned, so `terraform destroy` fails
   until every version + delete marker is removed:
   ```bash
   ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
   BUCKET="genai-etk-terraform-state-${ACCOUNT}"
   aws s3api delete-objects --bucket "${BUCKET}" \
     --delete "$(aws s3api list-object-versions --bucket "${BUCKET}" \
     --query '{Objects: (Versions // `[]`) + (DeleteMarkers // `[]`) | [].{Key:Key,VersionId:VersionId}}' --output json)" || true
   ```
4. **Bootstrap stack last** — `cd bootstrap && terraform destroy`. Removes
   ECR repos, DynamoDB lock table, state bucket, and SSM
   manifest. Once this runs, the next bootstrap-apply against the same
   account starts from scratch.

Only do this if you are intentionally rebuilding the bootstrap.

### Verification after teardown

After each step, verify resources are removed:

```bash
# After step 1 — confirm app resources gone
terraform state list   # should return empty (no resources)

# After step 4 — confirm bootstrap resources gone
aws s3api head-bucket --bucket "genai-etk-terraform-state-${ACCOUNT}" 2>&1 | grep -q "404" && echo "Bucket removed"
aws dynamodb describe-table --table-name genai-etk-terraform-locks 2>&1 | grep -q "ResourceNotFoundException" && echo "Lock table removed"
```

> ⚠️ **Orphaned resources**: If teardown is interrupted mid-way, you may have orphaned Lambda functions, SQS queues, or Step Function state machines still incurring costs. Use `aws resourcegroupstaggingapi get-resources --tag-filters Key=project,Values=genai-etk` to find any remaining tagged resources.

See `packages/terraform/README.md` for the customer module's variable reference, security hardening summary, and consumption pattern.

## License

Licensed under Apache-2.0. See the [LICENSE](../../LICENSE) file at the repository root.
