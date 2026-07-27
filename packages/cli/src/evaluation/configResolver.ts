import { GetConfigurationCommand } from '@awssolutions/gen-ai-evaluation-toolkit-client';
import { getClient } from '@src/client';

/**
 * Fetch a stored evaluation configuration and return the evaluationConfiguration body.
 * Used by submit commands to populate scorers/app from a stored config reference.
 *
 * @param configName  Name of the stored configuration.
 * @param version     Optional version pin. When omitted, the latest version is fetched.
 */
export async function resolveConfig(configName: string, version?: number): Promise<Record<string, unknown>> {
  const { configuration } = await getClient().send(new GetConfigurationCommand({ name: configName, version }));
  const evalConfig = configuration.config.evaluationConfiguration;
  if (!evalConfig || typeof evalConfig !== 'object') {
    throw new Error(`Configuration '${configName}' has no evaluationConfiguration`);
  }
  return evalConfig as Record<string, unknown>;
}
