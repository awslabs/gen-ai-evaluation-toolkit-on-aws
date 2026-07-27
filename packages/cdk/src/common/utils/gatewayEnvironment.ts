import { IGrantable } from 'aws-cdk-lib/aws-iam';
import { GatewayConfig } from '../types/gatewayConfig';

/**
 * Minimal structural type for a target that accepts environment variables.
 * Satisfied by both `lambda.Function` and `ecs.ContainerDefinition`.
 */
export interface GatewayEnvTarget {
  addEnvironment(key: string, value: string): unknown;
}

/**
 * Emits the standard AI Gateway environment variables onto an env target
 * (Lambda function or ECS container) and grants read access to the OAuth2
 * client secret on the supplied grantable.
 *
 * Centralizes the `AI_GATEWAY_*` env-var contract so all plugin types
 * (lambdaEvaluator, lambdaPlugin, ecsPlugin) stay consistent and can't drift.
 * `modelId` is required in `GatewayConfig`, so `AI_GATEWAY_MODEL_ID` is always emitted.
 *
 * @param envTarget Function or container definition receiving the env vars.
 * @param grantable Principal granted read access to the client secret — the
 *                  function itself for Lambda, the task role for ECS.
 * @param config    AI Gateway configuration.
 */
export function addGatewayEnvironment(envTarget: GatewayEnvTarget, grantable: IGrantable, config: GatewayConfig): void {
  envTarget.addEnvironment('AI_GATEWAY_ENDPOINT', config.gatewayEndpoint);
  envTarget.addEnvironment('AI_GATEWAY_TOKEN_ENDPOINT', config.tokenEndpoint);
  envTarget.addEnvironment('AI_GATEWAY_CLIENT_ID', config.clientId);
  envTarget.addEnvironment('AI_GATEWAY_CLIENT_SECRET_ARN', config.clientSecret.secretArn);
  envTarget.addEnvironment('AI_GATEWAY_MODEL_ID', config.modelId);
  if (config.scope) {
    envTarget.addEnvironment('AI_GATEWAY_SCOPE', config.scope);
  }
  config.clientSecret.grantRead(grantable);
}
