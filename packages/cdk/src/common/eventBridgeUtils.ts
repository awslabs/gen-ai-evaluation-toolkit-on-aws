import { EventBridge } from '@aws-sdk/client-eventbridge';
import { lazy } from './lazy';
import { log } from './api/utils';

const eventBridge = lazy(() => new EventBridge({}));

type Props<T> = {
  detail: T;
  detailType: string;
  eventBus: string;
  source: string;
};

export async function emitEvent<T>(props: Props<T>): Promise<void> {
  log.info('Sending event to EventBridge:', JSON.stringify(props, null, 2));

  try {
    const result = await eventBridge().putEvents({
      Entries: [
        {
          Detail: JSON.stringify(props.detail),
          DetailType: props.detailType,
          Source: props.source,
          EventBusName: props.eventBus,
        },
      ],
    });

    log.info('EventBridge response:', JSON.stringify(result, null, 2));

    if (result.FailedEntryCount && result.FailedEntryCount > 0) {
      throw new Error(`Failed to send events: ${JSON.stringify(result.Entries)}`);
    }
  } catch (error) {
    log.error('Error in emitEvent:', error as Error);
    throw error;
  }
}
