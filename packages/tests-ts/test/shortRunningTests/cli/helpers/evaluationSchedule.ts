import { IAsyncDisposable } from '../../../types';
import { $ } from './test-utils';

export type EvalSchedule = {
  name: string;
};

type EvalScheduleParams = { configName?: string; configFile?: { path: string }; version?: number; cron?: string; experimentName?: string };

/**
 * Creates an evaluation schedule and returns an eval schedule object
 * @param {EvalConfig} params - The evaluation configuration
 * @returns {Promise<EvalSchedule>} An eval schedule object
 */
export async function createEvalSchedule(params: EvalScheduleParams): Promise<IAsyncDisposable<EvalSchedule>> {
  const args = [
    'genai-etk eval schedule create',
    `--cron ${params.cron ?? '"0 0 * * ? *"'}`,
    'configFile' in params && params.configFile
      ? `--config-file ${params.configFile.path}`
      : `--config-reference ${params.configName}`,
    'version' in params ? `--config-version ${params.version}` : '',
    'experimentName' in params ? `--experiment-name ${params.experimentName}` : '',
  ];

  const schedule = await $.json<EvalSchedule>`${args.join(' ')}`;

  expect(schedule.name).toBeTruthy();

  return {
    ...schedule,
    async [Symbol.asyncDispose]() {
      await deleteEvalSchedule(schedule.name);
    },
  };
}

/**
 * Deletes the given eval schedule
 * @param {string} scheduleName - The name of the schedule to delete
 * @returns {Promise<void>}
 */
export async function deleteEvalSchedule(scheduleName?: string): Promise<void> {
  if (!scheduleName) return;
  try {
    await $`genai-etk eval schedule delete --name ${scheduleName}`;
  } catch (error) {
    // we do not care if the resource does not exist:
    if (error instanceof Object && 'stderr' in error && error.stderr === 'Error: Resource not found') return;
    console.warn(`Failed to cleanup schedule ${scheduleName}: ${JSON.stringify(error)}`, error);
  }
}
