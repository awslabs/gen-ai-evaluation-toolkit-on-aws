import { IAsyncDisposable } from '../../../types';
import { $, createTempFile, TempFile } from './test-utils';

export type EvalConfig = { name: string; version: number };

export type EvalConfigBody = {
  scorers: Record<string, unknown>;
  app?: Record<string, unknown>;
};

/**
 * Writes an evaluation config body to a temp JSON file. Disposable.
 */
export async function writeEvalConfigFile(testId: string, body: EvalConfigBody): Promise<IAsyncDisposable<TempFile>> {
  return createTempFile(`eval-config-${testId}.json`, JSON.stringify(body));
}

/**
 * Creates a stored evaluation configuration and returns its name + version.
 *
 * NOTE: there is no `eval config delete` CLI command — the configuration store retains
 * named versions; cleanup relies on per-test unique names.
 */
export async function createEvalConfig(testId: string, body: EvalConfigBody): Promise<EvalConfig> {
  const name = `eval-config-${testId}`;
  await using file = await writeEvalConfigFile(testId, body);

  const result = await $`genai-etk eval config create --name ${name} --config-file ${file.path}`;

  expect(result.stdout).toContain('Configuration created successfully');
  expect(result.stdout).toContain(`Name: ${name}`);
  const versionMatch = result.stdout.match(/Version:\s+(\d+)/);
  expect(versionMatch).not.toBeNull();
  const version = Number.parseInt(versionMatch![1], 10);
  expect(version).toBeGreaterThanOrEqual(1);

  return { name, version };
}

/**
 * Updates a stored evaluation configuration and returns the new version.
 */
export async function updateEvalConfig(testId: string, name: string, body: EvalConfigBody): Promise<EvalConfig> {
  await using file = await writeEvalConfigFile(testId, body);

  const result = await $`genai-etk eval config update --name ${name} --config-file ${file.path}`;

  expect(result.stdout).toContain('Configuration updated successfully');
  expect(result.stdout).toContain(`Name: ${name}`);
  const versionMatch = result.stdout.match(/Version:\s+(\d+)/);
  expect(versionMatch).not.toBeNull();
  return { name, version: Number.parseInt(versionMatch![1], 10) };
}
