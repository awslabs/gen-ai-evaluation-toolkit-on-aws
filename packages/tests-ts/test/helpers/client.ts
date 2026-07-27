import {
  GenAiEvaluationToolkitClient,
  ServiceInputTypes,
  ServiceOutputTypes,
} from '@awssolutions/gen-ai-evaluation-toolkit-ts-client';
import { GetParameterCommand, ParameterNotFound, SSMClient } from '@aws-sdk/client-ssm';
import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';
import { SmithyResolvedConfiguration } from '@smithy/smithy-client';
import { Command, HttpHandlerOptions } from '@smithy/types';
import assert from 'assert';
import { lazy } from './common';

const apiClient = lazy(async () => {
  return new GenAiEvaluationToolkitClient({
    endpoint: await getEndpoint(),
  });
});

// This is implemented as lazy, as some tests can expect errors
// so no need to keep fetching the data every time and it will always stay the same
const runInfo = lazy(async () => {
  const client = await apiClient();
  const region = await client.config.region();

  const stsClient = new STSClient({ region });
  const { Account: accountId } = await stsClient.send(new GetCallerIdentityCommand());

  return { region, accountId };
});

export async function send<InputType extends ServiceInputTypes, OutputType extends ServiceOutputTypes>(
  command: Command<
    ServiceInputTypes,
    InputType,
    ServiceOutputTypes,
    OutputType,
    SmithyResolvedConfiguration<HttpHandlerOptions>
  >,
  options?: HttpHandlerOptions,
): Promise<OutputType> {
  const client = await apiClient();
  try {
    return await client.send(command, options);
  } catch (error) {
    // Append account and region info the error
    const { accountId, region } = await runInfo();
    (error as Error).message += ` (account: ${accountId}, region: ${region})`;

    throw error;
  }
}

export async function getEndpoint(): Promise<string> {
  const ssmClient = new SSMClient({});
  try {
    const response = await ssmClient.send(
      new GetParameterCommand({
        Name: '/genai-etk/restApiEndpoint',
      }),
    );

    const endpoint = response.Parameter?.Value;
    assert(endpoint, "Endpoint is not provided through ssm key '/genai-etk/restApiEndpoint'");

    return endpoint;
  } catch (error) {
    if (error instanceof ParameterNotFound) {
      const stsClient = new STSClient({});
      const accountResponse = await stsClient.send(new GetCallerIdentityCommand({}));

      const account = accountResponse.Account;
      const region = await ssmClient.config.region();

      console.error(
        `Did not find parameter with key '/genai-etk/restApiEndpoint' in account ${account} and region ${region}`,
      );
    }
    throw error;
  }
}
