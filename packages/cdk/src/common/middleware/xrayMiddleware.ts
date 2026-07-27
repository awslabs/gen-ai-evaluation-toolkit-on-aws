import { Context } from 'aws-lambda';
import * as AWSXRay from 'aws-xray-sdk-core';
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { logErrorAndThrowInternalServer } from '@common/api/exceptions/serviceExceptions';

export function xrayMiddleware(
  handler: (event: APIGatewayProxyEvent, context: Context) => Promise<APIGatewayProxyResult>,
) {
  return async function wrappedHandler(event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> {
    try {
      // Individual clients are instrumented where they're created using:
      // AWSXRay.captureAWSv3Client(client)

      // Create a subsegment for the handler execution
      return await AWSXRay.captureAsyncFunc('handler', async (subsegment) => {
        try {
          const result = await handler(event, context);
          subsegment?.addAnnotation('statusCode', result.statusCode);
          return result;
        } catch (error) {
          subsegment?.addError(error as Error);
          throw error;
        }
      });
    } catch (error) {
      console.error('Error in X-Ray instrumented handler:', error);
      logErrorAndThrowInternalServer({
        internalMessage: 'Internal Server Error.',
        externalMessage: 'Internal Server Error.',
      });
    }
  };
}
