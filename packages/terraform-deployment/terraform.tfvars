# All root inputs auto-derive from the environment — this file is
# intentionally empty:
#   - aws_account_id / aws_region come from aws_caller_identity + the
#     active AWS profile (see main.tf).
#   - project_name / environment / ssm_image_tag_env read from
#     TF_VAR_project_name / TF_VAR_environment / TF_VAR_ssm_image_tag_env
#     which mise.toml defaults to sensible values (override in
#     mise.local.toml for your account).
# Pin values here only if you want to commit an override specific to
# this repo (e.g. a staging CI wants a fixed project name regardless of
# the developer's mise.local.toml).
