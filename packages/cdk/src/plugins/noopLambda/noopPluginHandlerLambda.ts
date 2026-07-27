import { setTimeout as sleep } from 'timers/promises';
import { getEnvVariable } from '@src/common';
import { emitEvent } from '@src/common/eventBridgeUtils';
import { log } from '@src/common/api/utils';
import { EventBridgeEvent, EventBridgeHandler } from 'aws-lambda';
import { ErrorEvent, InProgressEvent, SuccessEvent, WithTaskToken } from '../contracts';

type PluginHandler = EventBridgeHandler<string, WithTaskToken, void>;
type PluginEvent = EventBridgeEvent<string, WithTaskToken>;

export const handler: PluginHandler = async (event: PluginEvent) => {
  const pluginName = getEnvVariable((e) => e.PLUGIN.NAME);
  const delayInSeconds = +getEnvVariable((e) => e.PLUGIN.NOOP.DELAY_IN_SECONDS, '0');
  const eventBus = getEnvVariable((e) => e.PLUGIN.BUS_ARN)
    .split('/')
    .at(-1)!;

  log.info('Noop handler:', {
    pluginName: pluginName,
    eventBus: eventBus,
    delayInSeconds: delayInSeconds,
    event: event,
  });

  const detail = event.detail;
  try {
    for (let progress = 0; progress < delayInSeconds; progress++) {
      const progressResult: InProgressEvent = {
        status: 'inProgress',
        taskToken: detail.taskToken,
        percentage: progress / delayInSeconds,
      };

      await emitEvent({
        detail: progressResult,
        detailType: detail.responseDetailType,
        source: pluginName,
        eventBus: eventBus,
      });

      await sleep(1000);
    }

    const successResult: SuccessEvent = {
      status: 'success',
      taskToken: detail.taskToken,
      output: JSON.stringify({}),
    };

    await emitEvent({
      detail: successResult,
      detailType: detail.responseDetailType,
      source: pluginName,
      eventBus: eventBus,
    });
  } catch (error) {
    const errorResult: ErrorEvent = {
      status: 'error',
      taskToken: detail.taskToken,
      error: JSON.stringify(error),
    };

    await emitEvent({
      detail: errorResult,
      detailType: detail.responseDetailType,
      source: pluginName,
      eventBus: eventBus,
    });

    log.error('Error processing event:', { error: error });
    throw error;
  }
};

// Export for prebundling system (expects lambdaHandler)
export const lambdaHandler = handler;
