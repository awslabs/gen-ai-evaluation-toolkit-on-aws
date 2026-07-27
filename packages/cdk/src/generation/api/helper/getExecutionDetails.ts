import { GetGenerationOutput, GetGenerationServerOutput } from '@awssolutions/gen-ai-evaluation-toolkit-ts-ssdk';
import { DescribeExecutionCommand } from '@aws-sdk/client-sfn';
import { mapExecutionDetails } from './mapExecution';
import { sfnClient } from '@src/common';

export async function getExecutionDetails(executionArn: string): Promise<GetGenerationOutput> {
  const describeCommand = new DescribeExecutionCommand({
    executionArn: executionArn,
  });

  const executionDetails = await sfnClient().send(describeCommand);
  const result: GetGenerationServerOutput = mapExecutionDetails(executionDetails);

  return result;
}
