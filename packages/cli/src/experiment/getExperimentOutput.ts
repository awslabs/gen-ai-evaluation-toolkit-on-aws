import { ListExperimentOutputsCommand } from '@awssolutions/gen-ai-evaluation-toolkit-client';
import { getClient } from '@src/client';
import { renderTemplate } from '@src/templates/render';

/**
 * Returns experiment output for lates run of a single version.
 * @param request ListExperimentOutputsRequest
 * @return Promise<void>
 */
export async function getExperimentOutput(options: { name: string; version: number }): Promise<void> {
  const response = await getClient().send(
    new ListExperimentOutputsCommand({
      name: options.name,
      startVersion: options.version,
      endVersion: options.version,
      maxResults: 1,
    }),
  );

  await renderTemplate(`views/experiment/get-output`, response);
}
