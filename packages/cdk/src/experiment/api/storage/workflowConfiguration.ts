import { workflowConfigurationSchema } from '@experiment/api/storage/validation';
import {
  ConfigurationDetail,
  ListConfigurationsServerInput,
  ListConfigurationsServerOutput,
} from '@awssolutions/gen-ai-evaluation-toolkit-ts-ssdk';
import { ConfigurationRepository } from '@src/experiment/api/storage/configurationRepository';
import { lazy } from '@common';
import { HandlerContext } from '@common/api/apiGateway';
import { CONFIG_BUCKET_PREFIX } from '@src/common/config';

const configurationRepository = lazy(
  () =>
    new ConfigurationRepository(workflowConfigurationSchema, CONFIG_BUCKET_PREFIX, {
      customMetadataFields: {
        appId: (model): string | undefined => {
          const config = model?.config.evaluationConfiguration;
          if (config && typeof config === 'object' && 'appId' in config) {
            const val = (config as Record<string, unknown>).appId;
            return typeof val === 'string' ? val : undefined;
          }
          return undefined;
        },
      },
    }),
);

export async function createConfiguration(
  configuration: ConfigurationDetail,
  context: HandlerContext,
): Promise<ConfigurationDetail> {
  return configurationRepository().create(configuration, context);
}

export async function getConfiguration(name: string, version?: number): Promise<ConfigurationDetail> {
  const { config } = await configurationRepository().get({ name, version });
  return config;
}

export async function listConfigurations(
  input: ListConfigurationsServerInput,
): Promise<ListConfigurationsServerOutput> {
  const result = await configurationRepository().list(input);
  return {
    configurations: result.items,
    nextToken: result.continuationToken,
  };
}

export async function updateConfiguration(
  configuration: ConfigurationDetail,
  context: HandlerContext,
): Promise<ConfigurationDetail> {
  return configurationRepository().update(configuration, context);
}
