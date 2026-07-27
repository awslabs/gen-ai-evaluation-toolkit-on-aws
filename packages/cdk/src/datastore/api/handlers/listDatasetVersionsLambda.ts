import {
  Annotation,
  getListDatasetVersionsHandler,
  ListDatasetVersionsServerInput,
  ListDatasetVersionsServerOutput,
} from '@awssolutions/gen-ai-evaluation-toolkit-ts-ssdk';
import { Operation } from '@aws-smithy/server-common';
import { applyLambdaDecorators } from '@src/common/api/utils/lambdaWrapper';
import { APIGatewayProxyHandler } from 'aws-lambda';
import { getApiGatewayHandler, HandlerContext } from '@common/api/apiGateway';
import { listDatasetVersions } from '../helpers';
import { log } from '../utils';

export const listDatasetVersionsOperation: Operation<
  ListDatasetVersionsServerInput,
  ListDatasetVersionsServerOutput,
  HandlerContext
> = async (input, _context) => {
  const listDatasetVersionsOutput = await listDatasetVersions({
    datasetId: input.datasetId,
    maxResults: input.maxResults,
    lastEvaluatedSk: input.nextToken,
    conditionExpression: input.filter,
  });
  log.info(`Successfully fetched the versions of the dataset ${input.datasetId}`);
  return {
    versions: listDatasetVersionsOutput.entities.map(
      ({ datasetId, version, createdAt, createdBy, s3Location, annotations }) => ({
        datasetId,
        version,
        createdAt: new Date(createdAt),
        createdBy,
        s3Location,
        annotations: annotations
          ? (Object.entries(annotations).map(([name, annotationContent]) => ({
              name,
              ...annotationContent,
              annotatedAt: new Date(annotationContent.annotatedAt),
            })) as Annotation[])
          : undefined,
      }),
    ),
    nextToken: listDatasetVersionsOutput.lastEvaluatedSk,
  };
};

export const lambdaHandler: APIGatewayProxyHandler = getApiGatewayHandler(
  getListDatasetVersionsHandler(applyLambdaDecorators(listDatasetVersionsOperation)),
);
