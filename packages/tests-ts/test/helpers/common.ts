import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';

export function lazy<T>(factory: () => T): () => T {
  let instance: T | undefined = undefined;

  return () => {
    instance ??= factory();
    return instance;
  };
}

export type RagDocumentSource = {
  bucket: string;
  prefix: string;
};

/**
 * Retrieves a parameter value from AWS Systems Manager Parameter Store
 * @param parameterName The name of the parameter to retrieve
 * @returns The parameter value as a string
 */
export async function getSSMParameter(parameterName: string): Promise<string> {
  const ssmClient = new SSMClient({});
  const command = new GetParameterCommand({
    Name: parameterName,
    WithDecryption: true, // Decrypt secure string parameters
  });
  const response = await ssmClient.send(command);
  expect(response.Parameter).toBeDefined();
  expect(response.Parameter?.Value).toBeDefined();
  return response.Parameter!.Value!;
}

export const getCustomerBucketName = lazy(() => getSSMParameter('/genai-etk/customerProvidedBucketName'));

export const getExperimentArtifactStoreName = lazy(() => getSSMParameter('/genai-etk/experimentMlFlowBucketName'));

export async function getDummyTestData(prefix: string = 'evaluation/rag/3'): Promise<{ bucketName: string; prefix: string }> {
  return {
    bucketName: await getCustomerBucketName(),
    prefix,
  };
}

export async function getDummyRagDocuments(prefix: string = 'generation'): Promise<RagDocumentSource> {
  return {
    bucket: await getCustomerBucketName(),
    prefix,
  };
}

/**
 * Exhausts given fetch function until it does not return `nextToken`.
 */
export async function exhaust<T = unknown>(
  fetch: (nextToken?: string) => Promise<{ data: T[]; nextToken?: string }>,
): Promise<T[]> {
  const allData: T[] = [];

  let nextToken: string | undefined;
  do {
    const response = await fetch(nextToken);
    allData.push(...response.data);
    nextToken = response.nextToken;
  } while (nextToken != null);

  return allData;
}

/**
 * Used to generate sequential ids starting from 1.
 */
export class Counter {
  private value = 1;

  nextValue() {
    return this.value++;
  }

  peek() {
    return this.value;
  }
}
