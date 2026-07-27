import { App, Tags } from 'aws-cdk-lib';
import { getExistingVpcConfig, getEnv, getGatewayConfig } from './common';
import { createGenAiEtkStacks, DataStack, GenAiEtkPreReqsStack } from './stacks';
import { ExternalPluginsStack } from './stacks/external-plugins';

const env = getEnv();
console.log(`Creating stack for account ${env.account} in ${env.region}`);

export const app = new App();
Tags.of(app).add('app', 'genai-etk'); // Only informational

// Existing VPC (EXISTING_VPC_ID): requires EXISTING_API_GW_VPC_ENDPOINT_ID and
// optionally EXISTING_ISOLATED_SUBNET_IDS — see getExistingVpcConfig.
const existingVpcConfig = getExistingVpcConfig();
const preReqsStack = new GenAiEtkPreReqsStack(app, {
  env,
  existingVpcId: existingVpcConfig?.vpcId,
  // On the create-VPC path an existing execute-api endpoint may still be
  // reused (cost optimization); on the existing-VPC path it is required and
  // validated by getExistingVpcConfig.
  existingApiGwVpcEndpointId: existingVpcConfig?.apiGwVpcEndpointId ?? process.env.EXISTING_API_GW_VPC_ENDPOINT_ID,
  existingIsolatedSubnetIds: existingVpcConfig?.isolatedSubnetIds,
});

// Always set: created/reused by the construct, or customer-provided when using an existing VPC.
const apiGwVpcEndpointId = preReqsStack.vpc.apiGwVpcEndpointId;

const genAiEtk = createGenAiEtkStacks(app, 'GenAiEtk', {
  env,
  vpc: preReqsStack.vpc.vpc,
  encryptionKey: preReqsStack.kmskey?.key,
  apiGwProps: {
    apiGwVpcEndpointId,
    publicEndpointType: 'EDGE',
  },
});

// DataStack first — it owns the bucket; no dependency on ExternalPluginsStack.
const dataStack = new DataStack(app, { env });

// ExternalPluginsStack receives dataBucket and owns all bucket grants.
// Isolated subnets (from the VPC construct) are passed for the AAJ Lambda.
const isolatedSubnets = preReqsStack.vpc.isolatedSubnets;
const externalPluginsStack = new ExternalPluginsStack(app, {
  env,
  vpc: preReqsStack.vpc.vpc,
  uploadContainerImage: preReqsStack.uploadContainerImage.bind(preReqsStack),
  createGenEcsPlugin: genAiEtk.createGenEcsPlugin,
  eventBus: genAiEtk.exports.eventBus,
  restApiId: genAiEtk.exports.restApiId,
  dataBucket: dataStack.dataBucket,
  agentAsJudgeIsolatedSubnets: isolatedSubnets.length > 0 ? isolatedSubnets : undefined,
  gatewayConfig: getGatewayConfig(),
});
// Explicit dependencies
externalPluginsStack.addDependency(preReqsStack);
externalPluginsStack.addDependency(dataStack);
genAiEtk.stacks.forEach((stack) => {
  dataStack.addDependency(stack);
  externalPluginsStack.addDependency(stack);
});
