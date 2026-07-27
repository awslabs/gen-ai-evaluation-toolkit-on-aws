import { ISecret } from 'aws-cdk-lib/aws-secretsmanager';

/**
 * AI Gateway integration configuration.
 * When provided, all plugins will route LLM calls through the AI Gateway.
 */
export type GatewayConfig = {
  /** AI Gateway endpoint URL (e.g. https://gateway.app.dev/bedrock) */
  gatewayEndpoint: string;
  /** AI Gateway OAuth2 token endpoint URL */
  tokenEndpoint: string;
  /** AI Gateway application client ID */
  clientId: string;
  /** Secrets Manager secret containing the OAuth2 client secret */
  clientSecret: ISecret;
  /** Model name as registered in the AI Gateway */
  modelId: string;
  /**
   * OAuth2 scope(s) for the token request (space-separated). Optional —
   * omit for gateways whose IdP does not require a scope.
   */
  scope?: string;
};
