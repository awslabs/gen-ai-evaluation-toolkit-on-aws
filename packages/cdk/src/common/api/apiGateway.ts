import { convertEvent, convertVersion1Response } from '@aws-smithy/server-apigateway';
import { ServiceHandler } from '@aws-smithy/server-common';
import { APIGatewayProxyEvent, APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import { xrayMiddleware } from '../middleware/xrayMiddleware';
import { log } from '@common/api/utils';

/**
 * Defines anything the operation handler needs that is not modeled in the operation's Smithy model but comes from
 * other context
 */
export type HandlerContext = {
  user: string;
  requestTime: Date;
};

/**
 * Given a ServiceHandler, returns an APIGatewayProxyHandler that knows how to:
 * 1. convert the APIGateway request (APIGatewayProxyEvent) into inputs for the ServiceHandler
 * 2. invoke the ServiceHandler
 * 3. convert the output of ServiceHandler into the result (APIGatewayProxyResult) expected by APIGateway
 * @param handler ServiceHandler
 * @returns APIGatewayProxyResult
 */
export function getApiGatewayHandler(handler: ServiceHandler<HandlerContext>): APIGatewayProxyHandler {
  return xrayMiddleware(async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    // Reject requests with empty path parameters. API Gateway resolves a URL like
    // /datasets//testcases/abc to {datasetId: ""} which is never valid — all @httpLabel
    // members in the Smithy model are @required. Without this check the empty value
    // propagates to downstream services and causes an unhandled 500.
    const pathParams = event.pathParameters ?? {};
    for (const [key, value] of Object.entries(pathParams)) {
      if (!value || value.trim() === '') {
        log.warn(`Empty path parameter received: ${key}`);
        return {
          statusCode: 400,
          body: JSON.stringify({
            message: `Invalid value for path parameter: ${key}`,
          }),
        };
      }
    }

    try {
      const httpRequest = convertEvent(event);

      // when testing manually through API GW, header can be null/undefined
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (event.headers) {
        // Ensure X-Ray trace context is propagated
        const traceHeader = event.headers['X-Amzn-Trace-Id'];
        if (traceHeader) httpRequest.headers['X-Amzn-Trace-Id'] = traceHeader;
      }

      // Fallback supports future non-SigV4 auth (e.g. Lambda authorizer) where userArn may be absent
      const user = event.requestContext.identity.userArn || event.requestContext.identity.user;
      if (!user) {
        throw new Error(
          'IAM caller identity is missing from the request context — check API Gateway auth configuration',
        );
      }
      const context: HandlerContext = {
        user,
        requestTime: new Date(),
      };

      const result = await handler.handle(httpRequest, context);

      if (result.statusCode >= 200 && result.statusCode < 300) {
        log.info(`Successfully processed request: ${result.statusCode}`);
      } else if (result.statusCode >= 400 && result.statusCode < 500) {
        log.warn(`Client error: ${result.statusCode} with reason ${result.reason}`);
      } else if (result.statusCode >= 500 && result.statusCode < 600) {
        log.error(`Server error: ${result.statusCode} with reason ${result.reason}`);
      } else {
        log.error(`Unexpected response: ${result.statusCode} with reason ${result.reason}`);
      }

      return convertVersion1Response(result);
    } catch (error) {
      // This should generally not happen as the exceptions are wrapped in the handler
      log.error(`Error in API Gateway handler: ${error}`);
      return {
        statusCode: 500,
        body: JSON.stringify({
          message: 'Internal Server Error',
        }),
      };
    }
  });
}
