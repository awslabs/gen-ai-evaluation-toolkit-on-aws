import { GenAiEtkServiceOperations } from '@awssolutions/gen-ai-evaluation-toolkit-ts-ssdk';
import { Duration } from 'aws-cdk-lib';
import { Function } from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
import * as fs from 'fs';
import { OpenAPIV3 } from 'openapi-types';
import path from 'path';
import { SecuredNodejsFunction } from '@secured';
import { fromPascalCaseToCamelCase, fromPascalCaseToSnakeCase } from '../utils';
import { findPackageRoot } from '@src/common/utils/packageRoot';
import { IVpc } from 'aws-cdk-lib/aws-ec2';
import { PythonLambda } from '@src/experiment/constructs/pythonLambda';

export type ApiDetails = {
  name: GenAiEtkServiceOperations;
  description?: string;
  path: string;
  method: string;
};

export function getApiDetailList(): ApiDetails[] {
  return getApiDetails(resolveOpenApiPath());
}

/**
 * Resolves the path to the OpenAPI file.
 */
function resolveOpenApiPath(): string {
  const filePath = path.join(findPackageRoot(), 'assets', 'openapi.json');
  if (!fs.existsSync(filePath)) throw new Error(`Could not find ${filePath}`);
  return filePath;
}

/**
 * Extracts the API details from an Open API Definition/Model
 * @param sourcePath Location of the Open API Definition/Model (e.g. ../datastore/model/openapi.generated.json)
 * @returns {ApiDetails[]}
 */
function getApiDetails(sourcePath: string): ApiDetails[] {
  const openAPIDef: OpenAPIV3.Document = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));

  return Object.entries(openAPIDef.paths)
    .filter((entry): entry is [string, OpenAPIV3.PathsObject] => Boolean(entry[0] && entry[1]))
    .flatMap(([path, pathItem]) =>
      Object.entries(pathItem)
        .filter((entry): entry is [OpenAPIV3.HttpMethods, OpenAPIV3.OperationObject] =>
          Boolean(
            entry[0] &&
            entry[0].toUpperCase() in OpenAPIV3.HttpMethods &&
            entry[1] &&
            entry[1] instanceof Object &&
            'operationId' in entry[1],
          ),
        )
        .map(([method, operation]) => {
          const details: ApiDetails = {
            name: operation.operationId as GenAiEtkServiceOperations,
            description: operation.description,
            path,
            method: method.toUpperCase(),
          };
          return details;
        }),
    );
}

/**
 * Returns the Lambda handler for the given operation
 * @param scope lambda scope
 * @param operation the operation
 * @returns {Function} Lambda handler
 */
export function getDataStoreApiLambdaHandler(scope: Construct, operation: ApiDetails, vpc: IVpc): Function {
  return getNodeApiLambdaHandler(scope, operation, vpc);
}

/**
 * Returns the Lambda handler for the given operation
 * @param scope lambda scope
 * @param operation the operation
 * @returns {Function} Lambda handler
 */
export function getEvaluationApiLambdaHandler(scope: Construct, operation: ApiDetails, vpc: IVpc): Function {
  return getNodeApiLambdaHandler(scope, operation, vpc);
}

export function getExperimentApiTypescriptLambdaHandler(scope: Construct, operation: ApiDetails, vpc: IVpc): Function {
  return getNodeApiLambdaHandler(scope, operation, vpc);
}

export function getExperimentApiPythonLambdaHandler(
  scope: Construct,
  operation: ApiDetails,
  lambdaZipPath: string,
  vpc: IVpc,
): Function {
  return getPythonApiLambdaHandler(scope, operation, 'experiment_lambda.api', lambdaZipPath, vpc);
}

export function getGenerationApiLambdaHandler(scope: Construct, operation: ApiDetails, vpc: IVpc): Function {
  return getNodeApiLambdaHandler(scope, operation, vpc);
}

/**
 * Returns the typescript/node Lambda handler for the given operation
 * @param scope lambda scope
 * @param operation The name of the operation
 * @param vpc The VPC for the lambda
 * @param memorySize The memory size of the lambda
 * @returns {Function} Lambda handler
 */
export function getNodeApiLambdaHandler(
  scope: Construct,
  operation: ApiDetails,
  vpc: IVpc,
  memorySize?: number,
): Function {
  const operationName = fromPascalCaseToCamelCase(operation.name);

  // Handler path within the single bundle
  // The build script exports handlers as: export const createJobSchedulerLambda = handler0;
  // Each handler module has a lambdaHandler export, so we access it as: handlerName.lambdaHandler
  const handlerName = `${operationName}Lambda`;
  const handlerPath = `index.${handlerName}.lambdaHandler`;

  return new SecuredNodejsFunction(scope, `${operation.name}-Lambda`, {
    description: operation.description,
    timeout: Duration.seconds(29), // Same as API gateway default timeout
    memorySize: memorySize,
    vpc,
    handler: handlerPath,
  });
}

/**
 * Returns the python Lambda handler for the given operation
 * @param scope lambda scope
 * @param operation The name of the operation
 * @param basePath The base path to the lambda code
 * @returns {Function} Lambda handler
 */
export function getPythonApiLambdaHandler(
  scope: Construct,
  operation: ApiDetails,
  basePath: string,
  lambdaZipPath: string,
  vpc: IVpc,
): Function {
  return new PythonLambda(scope, `${operation.name}-Lambda`, {
    description: operation.description,
    handler: `${basePath}.${fromPascalCaseToSnakeCase(operation.name)}_lambda.handler`,
    lambdaZipPath: lambdaZipPath,
    timeout: Duration.seconds(29), // Same as API gateway default timeout
    vpc,
  });
}
