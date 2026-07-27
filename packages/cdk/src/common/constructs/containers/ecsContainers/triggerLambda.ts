import { ECSClient, RunTaskCommand } from '@aws-sdk/client-ecs';
import { getEnvVariable, lazy } from '@src/common';
import { EventBridgeEvent } from 'aws-lambda';
import { inspect } from 'util';

const ecsClient = lazy(() => new ECSClient());

export async function handler(event: EventBridgeEvent<string, unknown>) {
  console.log('Triggering plugin with event:', inspect({ event }, { depth: null }));

  // Get environment variables from Lambda
  const clusterName = getEnvVariable((env) => env.PLUGIN.ECS.CLUSTER_NAME);
  const taskDefinition = getEnvVariable((env) => env.PLUGIN.ECS.TASK_DEFINITION);
  const containerName = getEnvVariable((env) => env.PLUGIN.ECS.TASK_CONTAINER_NAME);
  const securityGroupId = getEnvVariable((env) => env.PLUGIN.ECS.TASK_SECURITY_GROUP_ID);
  const subnetIds = getEnvVariable((env) => env.PLUGIN.ECS.SUBNET_IDS, '')
    .split(',')
    .filter((str) => str != '');

  const result = await ecsClient().send(
    new RunTaskCommand({
      cluster: clusterName,
      taskDefinition: taskDefinition,

      launchType: 'FARGATE',
      networkConfiguration: {
        awsvpcConfiguration: {
          subnets: subnetIds,
          assignPublicIp: 'DISABLED',
          securityGroups: [securityGroupId],
        },
      },
      overrides: {
        containerOverrides: [
          {
            name: containerName,
            environment: [
              {
                name: 'CONFIG',
                value: JSON.stringify(event.detail),
              },
            ],
          },
        ],
      },
    }),
  );

  if (result.failures && result.failures.length > 0) {
    console.error('Task launch failures:', JSON.stringify(result.failures, null, 2));
    throw new Error(`Failed to start ECS task: ${result.failures[0]!.reason}`);
  }

  console.log('ECS Task started:', JSON.stringify(result, null, 2));
}

export const lambdaHandler = handler;
