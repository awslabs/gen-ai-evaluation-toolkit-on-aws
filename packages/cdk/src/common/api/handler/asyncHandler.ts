import { getEnvVariable } from '@common';
import { log } from '@common/api/utils';
import { emitEvent } from '@common/eventBridgeUtils';
import { WithTaskToken } from '@plugins/contracts';

export type StepFunctionInvocationEvent<T> = {
  detail?: T;
  taskToken: string;
};

/**
 * Handles asynchronous step function invocations by emitting events with task tokens.
 *
 * @param event - The step function invocation event containing the task token and details
 * @throws {Error} When required environment variables are not defined
 * @throws {Error} When event emission fails
 * @returns Promise that resolves when the event has been emitted successfully
 */
export async function asyncHandler(event: StepFunctionInvocationEvent<WithTaskToken>): Promise<void> {
  const requestDetailType = getEnvVariable((e) => e.ASYNC_AWAIT_STEP.REQUEST_DETAIL_TYPE);
  const source = getEnvVariable((e) => e.ASYNC_AWAIT_STEP.SOURCE);
  const responseDetailType = getEnvVariable((e) => e.ASYNC_AWAIT_STEP.RESPONSE_DETAIL_TYPE);
  const eventBus = getEnvVariable((e) => e.ASYNC_AWAIT_STEP.EVENT_BUS);

  log.info('Received event:', { event: event });

  const context = {
    detail: {
      ...event.detail,
      taskToken: event.taskToken,
      responseDetailType: responseDetailType,
    },
    detailType: requestDetailType,
    eventBus: eventBus,
    source: source,
  };

  log.info('Attempting to emit event with payload:', { context: context });
  await emitEvent(context);
  log.info('Successfully emitted event');
}

export const lambdaHandler = asyncHandler;
