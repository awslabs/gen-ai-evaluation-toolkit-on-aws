import {
  BedrockClient,
  CreateModelInvocationJobCommand,
  GetModelInvocationJobCommand,
  ModelInvocationJobStatus,
} from '@aws-sdk/client-bedrock';
import assert from 'assert';
import { setTimeout as sleep } from 'timers/promises';
import { DEFAULT_POLL_INTERVAL, EnvVariable, TEST_CASE_FORMAT } from '../constants';
import { getEnvVariable } from './env';

type Nullable<T> = T | null | undefined;

function lazy<T>(factory: () => T): () => T {
  let instance: Nullable<T> = null;
  return function getter() {
    instance ??= factory();
    return instance;
  };
}

const bedrockClient = lazy(() => new BedrockClient());

/**
 * Creates a Bedrock batch job to process test cases and validate them against criteria
 */
export async function createBedrockBatchJob(
  runId: string,
  inputS3Uri: string,
  outputS3Uri: string,
  modelId: string,
): Promise<string> {
  const command = new CreateModelInvocationJobCommand({
    jobName: `etk-testcasevalidation-${runId}`,
    modelId,
    inputDataConfig: {
      s3InputDataConfig: {
        s3Uri: inputS3Uri,
        s3InputFormat: 'JSONL',
      },
    },
    outputDataConfig: {
      s3OutputDataConfig: {
        s3Uri: outputS3Uri,
      },
    },
    roleArn: getEnvVariable(EnvVariable.BEDROCK_ROLE_ARN),
    clientRequestToken: runId,
  });

  const { jobArn } = await bedrockClient().send(command);
  assert(jobArn != null);

  console.log(`Created Bedrock batch job: ${jobArn}`);

  return jobArn;
}

/**
 * Checks the status of a Bedrock batch job
 */
export async function checkBedrockBatchJobStatus(jobArn: string): Promise<ModelInvocationJobStatus> {
  const { status } = await bedrockClient().send(
    new GetModelInvocationJobCommand({
      jobIdentifier: jobArn,
    }),
  );

  assert(status != null);
  return status;
}

/**
 * Polls the status of a Bedrock batch job
 */
export async function waitUntilJobTerminates(
  jobArn: string,
  onStatusChange?: (status: string) => void,
  intervalMs = DEFAULT_POLL_INTERVAL,
): Promise<void> {
  let status: Nullable<ModelInvocationJobStatus>;
  const terminalStatuses: ModelInvocationJobStatus[] = [
    ModelInvocationJobStatus.COMPLETED,
    ModelInvocationJobStatus.FAILED,
    ModelInvocationJobStatus.STOPPED,
    ModelInvocationJobStatus.EXPIRED,
  ];

  do {
    if (status != null) {
      if (onStatusChange) {
        onStatusChange(status);
      }
      console.log(`Sleeping for ${intervalMs}ms before next status check`);
      await sleep(intervalMs);
    }

    status = await checkBedrockBatchJobStatus(jobArn);
    console.log(`Batch job status: ${status}`);
  } while (!terminalStatuses.includes(status));

  assert(status == ModelInvocationJobStatus.COMPLETED, `Bedrock job status: ${status}`);
}

export function createModelInput(input: string, prompt: string, criteria: string[], threshold: number) {
  return {
    modelInput: {
      max_tokens: 4096,
      anthropic_version: 'bedrock-2023-05-31',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: input,
            },
            {
              type: 'text',
              text: `${prompt}\nResponse must be valid JSON object in format ${TEST_CASE_FORMAT}
              Evaluation Criteria:
                ${criteria.map((criterion, index) => `${index + 1}. ${criterion}`).join('\n')}
              Mark a test case as valid="false" if it fails any of these criteria.
              Validation Rules:
- Mark a test case as valid="true" if it meets ${threshold * 100}% or more of the criteria
- Mark a test case as valid="false" if it meets less than ${threshold * 100}% of the criteria
- Each criterion is weighted equally`,
            },
          ],
        },
      ],
    },
  };
}
