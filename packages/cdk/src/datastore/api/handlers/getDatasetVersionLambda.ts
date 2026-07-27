import {
  Annotation,
  GetDatasetVersionServerInput,
  GetDatasetVersionServerOutput,
  getGetDatasetVersionHandler,
} from '@awssolutions/gen-ai-evaluation-toolkit-ts-ssdk';
import { Operation } from '@aws-smithy/server-common';
import { logErrorAndThrowResourceNotFound, logErrorAndThrowValidation } from '@common/api/exceptions/serviceExceptions';
import { VERSION_HEAD, VERSION_LATEST } from '@common/config';
import { HandlerContext, getApiGatewayHandler } from '@common/api/apiGateway';
import { getDataset, getDatasetVersion, parseVersionString } from '@datastore/api/helpers';
import { applyLambdaDecorators } from '@src/common/api/utils/lambdaWrapper';
import { APIGatewayProxyHandler } from 'aws-lambda';

export const getDatasetVersionOperation: Operation<
  GetDatasetVersionServerInput,
  GetDatasetVersionServerOutput,
  HandlerContext
> = async (input, _context) => {
  // These fields are required, but smithy always generates input type as optional
  const datasetId = input.datasetId as string;
  let version = parseVersionString(input.version as string);

  // If version == latest, get latest dataset version
  if (version == VERSION_LATEST) {
    const { currentVersion } = await getDataset(datasetId);
    if (currentVersion == null || currentVersion == 0) {
      logErrorAndThrowResourceNotFound({ externalMessage: 'Dataset has no versions' });
    }

    version = currentVersion;
  }

  if (version == VERSION_HEAD || version <= 0) {
    logErrorAndThrowValidation({ externalMessage: `Invalid version ${input.version}` });
  }

  const datasetVersion = await getDatasetVersion(datasetId, version);

  // Convert annotation's timestamp into Date
  const annotations = datasetVersion.annotations
    ? (Object.entries(datasetVersion.annotations).map(([name, annotationContent]) => ({
        name,
        ...annotationContent,
        annotatedAt: new Date(annotationContent.annotatedAt),
      })) as Annotation[])
    : undefined;

  return { ...datasetVersion, createdAt: new Date(datasetVersion.createdAt), annotations };
};

export const lambdaHandler: APIGatewayProxyHandler = getApiGatewayHandler(
  getGetDatasetVersionHandler(applyLambdaDecorators(getDatasetVersionOperation)),
);
