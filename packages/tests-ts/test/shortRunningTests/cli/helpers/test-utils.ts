import { exec } from 'child_process';
import * as fs from 'fs/promises';
import { promisify } from 'util';
import { getEndpoint } from '../../../helpers/client';
import { IAsyncDisposable } from '../../../types';
import path from 'path';
import os from 'os';

const MAX_BUFFER = 10 * 1024 * 1024; // 10MB buffer
const execAsync = promisify(exec);
// Find the path to the genai-etk binary using Node's module resolution
const binPath = require.resolve('@awssolutions/gen-ai-evaluation-cli/dist/genai-etk');

type ProcessOutput = {
  stdout: string;
  stderr: string;
};

type ProcessPromise = Promise<ProcessOutput>;

type CliInvoker = {
  (template: TemplateStringsArray, ...args: unknown[]): ProcessPromise;
  json<T>(template: TemplateStringsArray, ...args: unknown[]): Promise<T>;
};

export type ExecError = {
  message?: string;
  stdout?: string;
  stderr?: string;
};

// Export $ for use in tests
export let $: CliInvoker;

/**
 * Initialize the test environment
 * - Sets up the GEN_AI_ETK_API_URL environment variable
 * - Configures the $ function for tests
 */
export async function setupTestEnvironment(): Promise<void> {
  const endpoint = await getEndpoint();

  $ = Object.assign(
    (template: TemplateStringsArray, ...args: unknown[]) => invokeCliCommand(binPath, endpoint, template, ...args),
    {
      async json<T>(template: TemplateStringsArray, ...args: unknown[]): Promise<T> {
        const newTemplate: string[] = [...template];
        newTemplate[newTemplate.length - 1] = template[newTemplate.length - 1] + ' --output json';

        const finalTemplate = Object.assign([...newTemplate], {
          raw: newTemplate,
        }) as TemplateStringsArray;

        const result = await $(finalTemplate, ...args);
        try {
          return JSON.parse(result.stdout);
        } catch (err) {
          // Needed?
          console.error(`Failed to parse JSON: ${result.stdout}`);
          throw err;
        }
      },
    },
  );

  await verifyCli();
}

/**
 * Invokes a CLI command by replacing 'genai-etk' with a node invocation directly into the cli module
 * @param binPath The location of the genai-etk cli module
 * @param endpoint The API GW endpoint of the GenAI ETK Backend
 * @param template The cli command to run
 * @param args The args of the command
 * @returns The result of the execution
 */
async function invokeCliCommand(
  binPath: string,
  endpoint: string,
  template: TemplateStringsArray,
  ...args: unknown[]
): Promise<ProcessOutput> {
  const commandStr = String.raw(template, ...args);

  // Replace all occurrences of genai-etk with node binPath
  // The cli might not be installed in the current env/shell but the node module is available through package json
  // This allows to run the same test locally even if CLI is not installed
  const replacedCommand = commandStr.replace(/genai-etk/g, `node ${binPath}`);

  // GEN_AI_ETK_API_URL is a mandatory variable to genai-etk and needs to be set for each command:
  const processedCommand = `GEN_AI_ETK_API_URL=${endpoint} ${replacedCommand}`;

  return executeCommandWithErrorHandling(processedCommand);
}

/**
 * Execute a command and handle errors consistently
 * Useful if the command is supposed to be failing
 * @param {string} command - Command to execute
 * @returns {Promise<ProcessOutput>} - Command execution result
 */
async function executeCommandWithErrorHandling(command: string): Promise<ProcessOutput> {
  try {
    const { stdout, stderr } = await execAsync(command, { maxBuffer: MAX_BUFFER });
    return { stdout, stderr };
  } catch (error) {
    // Preserve the error and re-throw it with stdout and stderr
    const execError = error as ExecError;
    const enhancedError = new Error(execError.message?.trim() || 'Command execution failed');
    Object.assign(enhancedError, {
      stdout: execError.stdout?.trim() || '',
      stderr: execError.stderr?.trim() || '',
    });

    throw enhancedError;
  }
}

export type TempFile = {
  path: string;
};

/**
 * Creates a temporary file with the given content
 * @param {string} fileName - The path where the file should be created
 * @param {string} content - The content to write to the file
 * @returns {Promise<TempFile>} A disposable file object
 */
export async function createTempFile(fileName: string, content: string): Promise<IAsyncDisposable<TempFile>> {
  const filePath = path.join(os.tmpdir(), fileName);
  await fs.writeFile(filePath, content);

  return {
    path: filePath,
    async [Symbol.asyncDispose]() {
      await fs.unlink(filePath).catch(() => {});
    },
  };
}

/**
 * Verify that the GenAI ETK CLI is available
 */
async function verifyCli(): Promise<void> {
  try {
    await $`genai-etk -v`;
  } catch (error) {
    console.error('GenAI ETK CLI is not installed or not in PATH', error);
    throw error;
  }
}

/**
 * Runs a command and expects it to fail with a specific error message
 * @param {ProcessPromise} command - The command to run
 * @param {string} expectedErrorMessage - The expected error message
 * @returns {Promise<string>} The error output
 */
export async function expectCommandToFail(command: ProcessPromise, expectedErrorMessage: string): Promise<string> {
  try {
    await command;
  } catch (error: unknown) {
    const err = error as { stdout?: string; stderr?: string; message?: string };
    const errorOutput = decodeURIComponent(err.stdout || err.stderr || err.message || '');

    if (!errorOutput.toLowerCase().includes(expectedErrorMessage.toLowerCase())) {
      throw new Error(`Expected error message "${expectedErrorMessage}" not found in output: "${errorOutput}"`);
    }
    return errorOutput;
  }
  throw new Error('Command should have failed but succeeded');
}
