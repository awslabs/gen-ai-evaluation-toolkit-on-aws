import { ArnFormat, Stack } from 'aws-cdk-lib';
import { StateMachine } from 'aws-cdk-lib/aws-stepfunctions';
import { Construct } from 'constructs';

export function getExecutionArnPattern(stateMachine: StateMachine) {
  const stack = Stack.of(stateMachine);
  return stack.formatArn({
    service: 'states',
    resource: 'execution',
    resourceName: `${stateMachine.stateMachineName}:*`,
    arnFormat: ArnFormat.COLON_RESOURCE_NAME,
  });
}

/**
 * Creates an ARN for a specific EventBridge Scheduler schedule
 * @param scope The construct scope to get stack context from
 * @param groupName The scheduler group name
 * @param scheduleName The schedule name (defaults to '*' for wildcard)
 * @returns The formatted scheduler ARN
 */
export function getSchedulerArn(scope: Construct, groupName: string, scheduleName: string = '*'): string {
  const stack = Stack.of(scope);
  return stack.formatArn({
    service: 'scheduler',
    resource: 'schedule',
    resourceName: `${groupName}/${scheduleName}`,
  });
}

/**
 * Creates an ARN pattern that matches all EventBridge Scheduler schedules
 * @param scope The construct scope to get stack context from
 * @returns The formatted ARN pattern for all schedules
 */
export function getAllSchedulesArn(scope: Construct): string {
  const stack = Stack.of(scope);
  return stack.formatArn({
    service: 'scheduler',
    resource: '*',
    resourceName: '*',
  });
}
