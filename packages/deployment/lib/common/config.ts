import assert from 'assert';
import { Environment } from 'aws-cdk-lib';

export function getEnv(): Environment {
  const account = process.env.AWS_ACCOUNT ?? process.env.CDK_DEFAULT_ACCOUNT;
  assert(account, 'One of (AWS_ACCOUNT, CDK_DEFAULT_ACCOUNT) env variables must be set');

  const region = process.env.AWS_REGION ?? process.env.CDK_DEFAULT_REGION;
  assert(region, 'One of (AWS_REGION, CDK_DEFAULT_REGION) env variables must be set');

  return { account, region };
}

export type ExistingVpcConfigInput = {
  vpcId: string;
  apiGwVpcEndpointId: string;
  isolatedSubnetIds?: string[];
};

/**
 * existing VPC configuration, driven by the EXISTING_VPC_ID env var. Returns
 * undefined when not deploying into an existing VPC.
 *
 * On the existing VPC path the deployment creates nothing inside the customer VPC —
 * no VPC endpoints, flow logs, or subnets — so the customer must provide:
 *
 * - EXISTING_API_GW_VPC_ENDPOINT_ID (required): ID of an existing execute-api
 *   interface VPC endpoint. The private REST API is bound to it.
 * - EXISTING_ISOLATED_SUBNET_IDS (comma-separated; mirrors Terraform's
 *   `existing_isolated_subnet_ids`): isolated (no-internet) subnet IDs for the
 *   agent-as-judge evaluator. Optional, but without it the evaluator falls back
 *   to PRIVATE_WITH_EGRESS subnets and fails its runtime airgap probe.
 */
export function getExistingVpcConfig(): ExistingVpcConfigInput | undefined {
  if (!process.env.EXISTING_VPC_ID) return undefined;

  const { EXISTING_VPC_ID, EXISTING_API_GW_VPC_ENDPOINT_ID, EXISTING_ISOLATED_SUBNET_IDS } = process.env;
  assert(
    /^vpc-[0-9a-f]{8,17}$/.test(EXISTING_VPC_ID),
    `EXISTING_VPC_ID must be a valid VPC ID (vpc-...), got: ${EXISTING_VPC_ID}`,
  );
  assert(
    EXISTING_API_GW_VPC_ENDPOINT_ID,
    'EXISTING_API_GW_VPC_ENDPOINT_ID must be set when EXISTING_VPC_ID is set: on the existing-VPC path the ' +
      'deployment creates no VPC endpoints, so you must provide the ID (vpce-...) of an existing execute-api ' +
      'interface endpoint in your VPC — the private REST API is bound to it.',
  );
  assert(
    /^vpce-[0-9a-f]{8,17}$/.test(EXISTING_API_GW_VPC_ENDPOINT_ID),
    `EXISTING_API_GW_VPC_ENDPOINT_ID must be a valid VPC endpoint ID (vpce-...), got: ${EXISTING_API_GW_VPC_ENDPOINT_ID}`,
  );

  const isolatedSubnetIds = EXISTING_ISOLATED_SUBNET_IDS
    ? EXISTING_ISOLATED_SUBNET_IDS.split(',')
        .map((id) => id.trim())
        .filter(Boolean)
    : undefined;
  isolatedSubnetIds?.forEach((id) =>
    assert(
      /^subnet-[0-9a-f]{8,17}$/.test(id),
      `Invalid subnet ID in EXISTING_ISOLATED_SUBNET_IDS: ${id} (expected format: subnet-...)`,
    ),
  );
  if (isolatedSubnetIds) {
    assert(
      isolatedSubnetIds.length >= 2,
      'EXISTING_ISOLATED_SUBNET_IDS must contain at least 2 comma-separated subnet IDs (across distinct AZs) ' +
        'when set — the agent-as-judge evaluator needs airgapped subnets in more than one AZ.',
    );
  } else {
    console.warn(
      'EXISTING_VPC_ID is set without EXISTING_ISOLATED_SUBNET_IDS — the agent-as-judge evaluator will fall ' +
        'back to PRIVATE_WITH_EGRESS subnets and fail its runtime airgap probe. Provide at least 2 isolated ' +
        '(no-internet) subnet IDs for production deployments when using an existing VPC.',
    );
  }

  return {
    vpcId: EXISTING_VPC_ID,
    apiGwVpcEndpointId: EXISTING_API_GW_VPC_ENDPOINT_ID,
    ...(isolatedSubnetIds && { isolatedSubnetIds }),
  };
}

export type GatewayConfigInput = {
  gatewayEndpoint: string;
  tokenEndpoint: string;
  clientId: string;
  clientSecretArn: string;
  modelId: string;
  /** OAuth2 scope(s) for the token request (space-separated). Optional. */
  scope?: string;
};

export function getGatewayConfig(): GatewayConfigInput | undefined {
  if (!process.env.AI_GATEWAY_ENDPOINT) return undefined;

  const {
    AI_GATEWAY_ENDPOINT,
    AI_GATEWAY_TOKEN_ENDPOINT,
    AI_GATEWAY_CLIENT_ID,
    AI_GATEWAY_CLIENT_SECRET_ARN,
    AI_GATEWAY_MODEL_ID,
    AI_GATEWAY_SCOPE,
  } = process.env;
  assert(AI_GATEWAY_TOKEN_ENDPOINT, 'AI_GATEWAY_TOKEN_ENDPOINT must be set when AI_GATEWAY_ENDPOINT is set');
  assert(AI_GATEWAY_CLIENT_ID, 'AI_GATEWAY_CLIENT_ID must be set when AI_GATEWAY_ENDPOINT is set');
  assert(AI_GATEWAY_CLIENT_SECRET_ARN, 'AI_GATEWAY_CLIENT_SECRET_ARN must be set when AI_GATEWAY_ENDPOINT is set');
  assert(AI_GATEWAY_MODEL_ID, 'AI_GATEWAY_MODEL_ID must be set when AI_GATEWAY_ENDPOINT is set');

  return {
    gatewayEndpoint: AI_GATEWAY_ENDPOINT,
    tokenEndpoint: AI_GATEWAY_TOKEN_ENDPOINT,
    clientId: AI_GATEWAY_CLIENT_ID,
    clientSecretArn: AI_GATEWAY_CLIENT_SECRET_ARN,
    modelId: AI_GATEWAY_MODEL_ID,
    ...(AI_GATEWAY_SCOPE && { scope: AI_GATEWAY_SCOPE }),
  };
}
