import { logErrorAndThrowInternalServer } from '@common/api/exceptions/serviceExceptions';
import { EnvVariable } from './config';
import { Arn, ArnFormat } from 'aws-cdk-lib';

/**
 * Validates and retrieves env variable
 * @param envVar variable name
 * @returns env variable value
 */
export function getEnvVariable<T extends string | ((env: typeof EnvVariable) => string)>(
  envVar: T,
  defaultValue?: string,
): string {
  const envValue = typeof envVar === 'string' ? process.env[envVar] : process.env[envVar(EnvVariable)];

  if (!envValue) {
    if (defaultValue) return defaultValue;

    logErrorAndThrowInternalServer({
      externalMessage: `Internal Server Error`,
      internalMessage: `Required env variable ${envVar} not found`,
    });
  }

  return envValue;
}

/**
 * Returns a unique resource name based upon the stage and environment
 * @param servicePrefix Prefix for the service
 * @param resourceName Name of the resource
 *  @param regionName AWS Deployment  Region
 * @param stageName Service  Deployment  Stage
 * @return {string} unique resource name
 * */
export function getUniqueResourceName(
  servicePrefix: string,
  resourceName: string,
  regionName: string,
  stageName: string,
): string {
  return `${stageName.toLowerCase()}-${regionName.toLowerCase()}-${servicePrefix}-${resourceName}`;
}

/**
 * Return a unique S3 bucket name based upon the stage and environment
 * @param servicePrefix Prefix for the service
 * @param shortBucketName A short and meaningful bucket name
 * @param accountId AWS account ID
 * @param regionName AWS Deployment  Region
 * @param stageName Service  Deployment  Stage
 * @returns unique S3 bucket name
 */
export function getUniqueS3BucketName(
  servicePrefix: string,
  shortBucketName: string,
  accountId: string,
  regionName: string,
  stageName: string,
): string {
  return getUniqueResourceName(servicePrefix, shortBucketName, regionName, stageName)
    .toLowerCase()
    .concat(accountId)
    .slice(0, 63);
}

/**
 * Converts a string from PascalCase to camelCase
 * @param pascalCaseString string to be converted
 * @returns converted string
 */
export function fromPascalCaseToCamelCase(pascalCaseString: string): string {
  return `${pascalCaseString[0]!.toLowerCase()}${pascalCaseString.slice(1)}`;
}

/**
 * Converts a string from PascalCase to snake_case
 * @param pascalCaseString string to be converted
 * @returns converted string
 */
export function fromPascalCaseToSnakeCase(pascalCaseString: string): string {
  return pascalCaseString
    .split(/(?=[A-Z])/)
    .join('_')
    .toLowerCase();
}

export function getExecutionId(executionArn: string): string {
  return executionArn.split(':').at(-1)!;
}

export function getExecutionArn(executionId: string, workflowArn: string): string {
  const accountId = getEnvVariable((env) => env.ACCOUNT_ID);
  const region = getEnvVariable((env) => env.REGION);
  const arnComponents = Arn.split(workflowArn, ArnFormat.COLON_RESOURCE_NAME);
  const stepFunctionName = arnComponents.resourceName!;
  const partition = arnComponents.partition;

  return `arn:${partition}:states:${region}:${accountId}:execution:${stepFunctionName}:${executionId}`;
}
