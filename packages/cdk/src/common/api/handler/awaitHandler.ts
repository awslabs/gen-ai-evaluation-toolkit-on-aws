import { SendTaskFailureCommand, SendTaskHeartbeatCommand, SendTaskSuccessCommand } from '@aws-sdk/client-sfn';
import { PluginResponse } from '@src/plugins/contracts';
import assert from 'assert';
import { EventBridgeEvent } from 'aws-lambda';
import { log } from '../utils';
import { sfnClient } from '@src/common';

/**
 * Handles AWS Step Functions task responses based on event status.
 * This handler processes EventBridge events and sends appropriate responses back to Step Functions
 * using the task token provided in the event.
 *
 * @param event - The EventBridge event containing task details and result
 * @throws Error if taskToken or status is missing from event detail
 * @throws Error if the Step Functions API call fails
 */
export async function awaitHandler(event: EventBridgeEvent<string, PluginResponse>): Promise<void> {
  log.info('Received event:', { event });
  assert(!!event.detail.taskToken, 'Missing taskToken in event detail');

  const status = event.detail.status;
  switch (status) {
    case 'success':
      event.detail.output = event.detail.output ?? '{}';
      await sfnClient().send(new SendTaskSuccessCommand(event.detail));
      log.info('Successfully emitted success');
      break;
    case 'inProgress':
      await sfnClient().send(new SendTaskHeartbeatCommand(event.detail));
      log.info('Successfully emitted heartbeat');
      break;
    case 'error':
      await sfnClient().send(new SendTaskFailureCommand(event.detail));
      log.info('Successfully emitted failure');
      break;
    default:
      throw new Error(`Invalid status: ${status}`);
  }
}

export const lambdaHandler = awaitHandler;
