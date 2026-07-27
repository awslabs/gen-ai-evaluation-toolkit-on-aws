import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import { EnvVariable, EventType, StatusType } from '../constants';
import { getEnvVariable } from './env';
import { lazy } from './objects';

const eventBridge = lazy(() => new EventBridgeClient());

export interface EmitEventOptions {
  taskToken: string;
  status: StatusType;
  message: string;
  error: string | undefined;
  cause: string | undefined;
}

export async function emitEvent(options: EmitEventOptions): Promise<void> {
  const { taskToken, status, message, error, cause } = options;
  const eventBusName = getEnvVariable(EnvVariable.EVENT_BUS_ARN).split('/').at(-1)!;
  const pluginName = process.env[EnvVariable.PLUGIN_NAME] ?? 'TestCaseGenerationPlugin';

  const command = new PutEventsCommand({
    Entries: [
      {
        EventBusName: eventBusName,
        Source: pluginName,
        DetailType: EventType.DONE,
        Detail: JSON.stringify({
          status: status,
          taskToken: taskToken,
          output: JSON.stringify({ message: message }),
          error: error,
          cause: cause,
        }),
        Time: new Date(),
      },
    ],
  });

  try {
    const response = await eventBridge().send(command);

    const failedCount = response.FailedEntryCount ?? 0;
    if (failedCount > 0) console.error('Some events failed to send:', response.Entries);
  } catch (err) {
    console.error('Error sending event:', err);
  }
}
