# Unit Tests — deployed_image_uris contract on the customer module surface.
#
# The customer module accepts a plain map(string) for plugin image URIs.
# Generation module resolves plugin images via lookup() with safe fallbacks.
# Evaluation module uses evaluator_builtin_image_uri (separate variable).
# These tests pin the seam so regressions fail loud at PR time.

mock_provider "aws" {
  override_data {
    target = data.aws_caller_identity.current
    values = {
      account_id = "123456789012"
    }
  }

  override_data {
    target = data.aws_region.current
    values = {
      name = "us-east-1"
    }
  }

  override_data {
    target = module.common.data.aws_availability_zones.available
    values = {
      names = ["us-east-1a", "us-east-1b", "us-east-1c"]
    }
  }

  override_data {
    target = data.aws_iam_policy_document.lambda_assume_role
    values = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Principal\":{\"Service\":\"lambda.amazonaws.com\"},\"Action\":\"sts:AssumeRole\"}]}"
    }
  }
}

variables {
  project_name   = "test-etk"
  environment    = "dev"
  region         = "us-east-1"
  aws_account_id = "123456789012"
}

# Default — minimal map with only the always-deployed agent-as-judge image
# (required since AAJ deploys unconditionally). Plan must succeed at root level;
# all other lookups fall through to null. Pins the customer-only consumption path.
run "minimal_map_plans_clean" {
  command = plan

  variables {
    deployed_image_uris = {
      "evaluator-agent-as-judge" = "111111111111.dkr.ecr.us-east-1.amazonaws.com/genai-etk-evaluator-agent-as-judge:abc1234"
    }
  }
}

# Populated — caller supplies generation plugin URIs.
run "populated_map_plans_clean" {
  command = plan

  variables {
    deployed_image_uris = {
      "plugin-gen-llm-as-judge"  = "111111111111.dkr.ecr.us-east-1.amazonaws.com/plugin-gen-llm-as-judge:abc1234"
      "plugin-gen-rag"           = "111111111111.dkr.ecr.us-east-1.amazonaws.com/plugin-gen-rag:abc1234"
      "evaluator_builtin"        = "111111111111.dkr.ecr.us-east-1.amazonaws.com/evaluator-builtin:abc1234"
      "evaluator-agent-as-judge" = "111111111111.dkr.ecr.us-east-1.amazonaws.com/genai-etk-evaluator-agent-as-judge:abc1234"
    }
  }

  assert {
    condition     = length(var.deployed_image_uris) == 4
    error_message = "Populated deployed_image_uris should retain all entries."
  }
}

# Partial — only some plugins supplied. Lookup() with a null fallback must
# not error on missing keys.
run "partial_map_plans_clean" {
  command = plan

  variables {
    deployed_image_uris = {
      "plugin-gen-rag"           = "111111111111.dkr.ecr.us-east-1.amazonaws.com/plugin-gen-rag:abc1234"
      "evaluator-agent-as-judge" = "111111111111.dkr.ecr.us-east-1.amazonaws.com/genai-etk-evaluator-agent-as-judge:abc1234"
    }
  }

  assert {
    condition     = lookup(var.deployed_image_uris, "plugin-gen-rag", null) != null
    error_message = "Supplied key should resolve via lookup()."
  }

  assert {
    condition     = lookup(var.deployed_image_uris, "plugin-gen-llm-as-judge", null) == null
    error_message = "Missing key should return the null fallback, not error."
  }
}
