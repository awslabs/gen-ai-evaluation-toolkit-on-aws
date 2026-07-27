import {
  CreateConfigurationCommand,
  UpdateConfigurationCommand,
  Workflow,
} from '@awssolutions/gen-ai-evaluation-toolkit-client';
import { getClient } from '@src/client';
import { renderTemplate } from '@src/templates/render';
import assert from 'assert';
import fs from 'fs';

type SupportedWorkflows = Exclude<Workflow, 'Generation'>;
type SupportedOperations = 'create' | 'update';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const operationConfigurations: Record<SupportedWorkflows, Record<SupportedOperations, { Command: any; configKey: string }>> = {
  Evaluation: {
    create: { Command: CreateConfigurationCommand, configKey: 'evaluationConfiguration' },
    update: { Command: UpdateConfigurationCommand, configKey: 'evaluationConfiguration' },
  },
};

/**
 * Create or update a configuration that can be used to run workflow job.
 */
export function createOrUpdateConfiguration(
  workflowType: SupportedWorkflows,
  operationType: SupportedOperations,
): (options: { name: string; configFile: string }) => Promise<void> {
  return async (options: { name: string; configFile: string }) => {
    const { Command, configKey } = operationConfigurations[workflowType][operationType];

    const configContent = JSON.parse(fs.readFileSync(options.configFile, 'utf-8'));
    assert(configContent, 'Configuration file is empty');

    const response = await getClient().send(
      new Command({
        configuration: {
          name: options.name,
          config: { [configKey]: configContent },
        },
      }),
    );

    await renderTemplate(`views/${workflowType.toLowerCase()}/configuration/${operationType}`, response);
  };
}
