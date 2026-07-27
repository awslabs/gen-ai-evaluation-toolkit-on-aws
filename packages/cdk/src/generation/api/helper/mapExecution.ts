import {
  GenerationJobListItem,
  GetGenerationOutput,
  StartGenerationInput,
  StepFunctionJobStatus,
} from '@awssolutions/gen-ai-evaluation-toolkit-ts-ssdk';
import { DescribeExecutionCommandOutput, ExecutionListItem, ExecutionStatus } from '@aws-sdk/client-sfn';
import { DocumentType } from '@smithy/smithy-client';
import { getExecutionId } from '@src/common';
import assert from 'assert';
import z from 'zod';

const documentSchema: z.ZodType<DocumentType> = z.lazy(() =>
  z.union([z.string(), z.number(), z.boolean(), z.array(documentSchema), z.record(documentSchema), z.null()]),
);

const executionInputSchema: z.ZodType<StartGenerationInput> = z.strictObject({
  experimentName: z.string().optional(),
  steps: z.array(
    z.strictObject({
      plugin: z.string(),
      configuration: documentSchema,
    }),
  ),
  configVersion: z.number().int().optional(),
});

export function mapExecutionDetails(source: DescribeExecutionCommandOutput): GetGenerationOutput {
  assert(source.executionArn, 'Execution ARN missing');
  assert(source.input, 'Execution input missing');

  const payload = executionInputSchema.parse(JSON.parse(source.input));
  const result: GetGenerationOutput = {
    id: getExecutionId(source.executionArn),
    status: statusMapping[source.status ?? ExecutionStatus.FAILED],
    createdAt: getStartDate(source),
    stoppedAt: source.stopDate,
    cause: source.cause,
    error: source.error,
    steps: payload.steps,
  };

  return result;
}

export function mapExecution(source: ExecutionListItem): GenerationJobListItem {
  assert(source.executionArn, 'Execution ARN missing');

  const item: GenerationJobListItem = {
    id: getExecutionId(source.executionArn),
    status: statusMapping[source.status ?? ExecutionStatus.FAILED],
    createdAt: getStartDate(source),
    stoppedAt: source.stopDate,
    cause: undefined,
    error: undefined,
  };

  return item;
}

function getStartDate(execution: { startDate?: Date }): Date {
  assert(execution.startDate, 'Execution has no start date');
  return execution.startDate;
}

const statusMapping: Record<ExecutionStatus, StepFunctionJobStatus> = {
  SUCCEEDED: StepFunctionJobStatus.SUCCEEDED,
  FAILED: StepFunctionJobStatus.FAILED,
  ABORTED: StepFunctionJobStatus.ABORTED,
  PENDING_REDRIVE: StepFunctionJobStatus.PENDING_REDRIVE,
  RUNNING: StepFunctionJobStatus.RUNNING,
  TIMED_OUT: StepFunctionJobStatus.TIMED_OUT,
};
