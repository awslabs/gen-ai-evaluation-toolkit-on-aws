import { getApiGatewayHandler, HandlerContext } from '@common/api/apiGateway';
import { ServiceHandler } from '@aws-smithy/server-common';
import { APIGatewayProxyEvent, APIGatewayProxyHandler, Context } from 'aws-lambda';
import { getArchiveAnnotationSchemaHandler } from '@awssolutions/gen-ai-evaluation-toolkit-ts-ssdk';
import { applyLambdaDecorators } from '@src/common/api/utils/lambdaWrapper';

jest.mock('@aws-smithy/server-apigateway', () => {
  return {
    convertEvent: jest.fn(),
    convertVersion1Response: jest.fn().mockReturnValue({ good: true }),
  };
});

describe('API Gateway Tests', () => {
  const mockHandle = jest.fn();
  const mockHandler: ServiceHandler<HandlerContext> = {
    handle: () => mockHandle(),
  };

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('getApiGatewayHandler - should return gatewayHandler and handle event successfully', async () => {
    mockHandle.mockReturnValue({
      statusCode: 200,
      headers: {},
    });
    const mockEvent = {
      headers: { Authorization: '123456789' },
      requestContext: {
        identity: {
          user: 'AROAEXAMPLE:session-name',
          userArn: 'arn:aws:sts::123456789012:assumed-role/Admin/session-name',
        },
      },
      path: 'test',
    } as unknown as APIGatewayProxyEvent;

    await getApiGatewayHandler(mockHandler)(mockEvent, {} as Context, jest.fn());
    expect(mockHandle).toHaveBeenCalledTimes(1);
    expect(mockHandle).toHaveReturnedWith({
      headers: {},
      statusCode: 200,
    });
  });

  it('getApiGatewayHandler - should return gatewayHandler and handle event successfully when Authorization token has Bearer', async () => {
    mockHandle.mockReturnValue({
      statusCode: 200,
      headers: {},
    });
    const mockEvent = {
      headers: { Authorization: 'Bearer 123456789' },
      requestContext: {
        identity: {
          user: 'AROAEXAMPLE:session-name',
          userArn: 'arn:aws:sts::123456789012:assumed-role/Admin/session-name',
        },
      },
      path: 'test',
    } as unknown as APIGatewayProxyEvent;

    await getApiGatewayHandler(mockHandler)(mockEvent, {} as Context, jest.fn());
    expect(mockHandle).toHaveBeenCalledTimes(1);
    expect(mockHandle).toHaveReturnedWith({
      headers: {},
      statusCode: 200,
    });
  });

  it('getApiGatewayHandler - should populate context.user with the full user ARN when available', async () => {
    let capturedUser: string | undefined = undefined;
    const userArn = 'arn:aws:sts::123456789012:assumed-role/Admin/session-name';
    const capturingHandler: ServiceHandler<HandlerContext> = {
      handle: jest.fn(async (_, context: HandlerContext) => {
        capturedUser = context.user;
        return { statusCode: 200, headers: {} };
      }),
    };
    const mockEvent = {
      requestContext: {
        identity: {
          user: 'AROAEXAMPLE:session-name',
          userArn,
        },
      },
    } as unknown as APIGatewayProxyEvent;

    await getApiGatewayHandler(capturingHandler)(mockEvent, {} as Context, jest.fn());

    expect(capturedUser).toBe(userArn);
  });

  it('getApiGatewayHandler - should fall back to identity.user when userArn is absent', async () => {
    let capturedUser: string | undefined = undefined;
    const capturingHandler: ServiceHandler<HandlerContext> = {
      handle: jest.fn(async (_, context: HandlerContext) => {
        capturedUser = context.user;
        return { statusCode: 200, headers: {} };
      }),
    };
    const mockEvent = {
      requestContext: {
        identity: {
          user: 'AROAEXAMPLE:session-name',
        },
      },
    } as unknown as APIGatewayProxyEvent;

    await getApiGatewayHandler(capturingHandler)(mockEvent, {} as Context, jest.fn());

    expect(capturedUser).toBe('AROAEXAMPLE:session-name');
  });

  it('getApiGatewayHandler - should fall back to identity.user when userArn is an empty string', async () => {
    let capturedUser: string | undefined = undefined;
    const capturingHandler: ServiceHandler<HandlerContext> = {
      handle: jest.fn(async (_, context: HandlerContext) => {
        capturedUser = context.user;
        return { statusCode: 200, headers: {} };
      }),
    };
    const mockEvent = {
      requestContext: {
        identity: {
          user: 'AROAEXAMPLE:session-name',
          userArn: '',
        },
      },
    } as unknown as APIGatewayProxyEvent;

    await getApiGatewayHandler(capturingHandler)(mockEvent, {} as Context, jest.fn());

    expect(capturedUser).toBe('AROAEXAMPLE:session-name');
  });

  it('getApiGatewayHandler - should fall back to identity.user when userArn is null', async () => {
    let capturedUser: string | undefined = undefined;
    const capturingHandler: ServiceHandler<HandlerContext> = {
      handle: jest.fn(async (_, context: HandlerContext) => {
        capturedUser = context.user;
        return { statusCode: 200, headers: {} };
      }),
    };
    const mockEvent = {
      requestContext: {
        identity: {
          user: 'AROAEXAMPLE:session-name',
          userArn: null,
        },
      },
    } as unknown as APIGatewayProxyEvent;

    await getApiGatewayHandler(capturingHandler)(mockEvent, {} as Context, jest.fn());

    expect(capturedUser).toBe('AROAEXAMPLE:session-name');
  });

  it('Missing auth returns 500', async () => {
    const mockEvent = { requestContext: { identity: {} }, headers: {} } as unknown as APIGatewayProxyEvent;

    const response = await getApiGatewayHandler(mockHandler)(mockEvent, {} as Context, jest.fn());

    expect(response!.statusCode).toBe(500);
    expect(response!.body).toBe(JSON.stringify({ message: 'Internal Server Error' }));
  });

  it('getApiGatewayHandler - should catch internal server error when handler fails', async () => {
    mockHandle.mockImplementation(() => {
      throw new Error('Internal error');
    });

    const mockEvent = {
      headers: {},
      requestContext: {
        identity: {
          user: 'test',
        },
      },
    } as unknown as APIGatewayProxyEvent;

    const response = await getApiGatewayHandler(mockHandler)(mockEvent, {} as Context, jest.fn());
    expect(response!.statusCode).toBe(500);
    expect(response!.body).toBe(JSON.stringify({ message: 'Internal Server Error' }));
  });

  it('getApiGatewayHandler - should map generic exception to correct HTTP code', async () => {
    const lambdaHandler: APIGatewayProxyHandler = getApiGatewayHandler(
      getArchiveAnnotationSchemaHandler(
        applyLambdaDecorators(() => {
          throw new Error('Sensitive information');
        }),
      ),
    );
    const mockEvent = {
      headers: {},
      requestContext: {
        identity: {
          user: 'test',
        },
      },
    } as unknown as APIGatewayProxyEvent;
    const response = await lambdaHandler(mockEvent, {} as Context, jest.fn());

    expect(response!.statusCode).toBe(500);
    expect(response!.body).toBe(JSON.stringify({ message: 'Internal Server Error' }));
  });

  describe('empty path parameter validation', () => {
    it('should return 400 when a path parameter is an empty string', async () => {
      const mockEvent = {
        headers: {},
        pathParameters: { datasetId: '' },
        requestContext: { identity: { user: 'test' } },
      } as unknown as APIGatewayProxyEvent;

      const response = await getApiGatewayHandler(mockHandler)(mockEvent, {} as Context, jest.fn());
      expect(response!.statusCode).toBe(400);
      expect(JSON.parse(response!.body).message).toBe('Invalid value for path parameter: datasetId');
      expect(mockHandle).not.toHaveBeenCalled();
    });

    it('should return 400 when a path parameter is null', async () => {
      const mockEvent = {
        headers: {},
        pathParameters: { datasetId: null },
        requestContext: { identity: { user: 'test' } },
      } as unknown as APIGatewayProxyEvent;

      const response = await getApiGatewayHandler(mockHandler)(mockEvent, {} as Context, jest.fn());
      expect(response!.statusCode).toBe(400);
      expect(JSON.parse(response!.body).message).toBe('Invalid value for path parameter: datasetId');
      expect(mockHandle).not.toHaveBeenCalled();
    });

    it('should return 400 when a path parameter is whitespace only', async () => {
      const mockEvent = {
        headers: {},
        pathParameters: { datasetId: '  ' },
        requestContext: { identity: { user: 'test' } },
      } as unknown as APIGatewayProxyEvent;

      const response = await getApiGatewayHandler(mockHandler)(mockEvent, {} as Context, jest.fn());
      expect(response!.statusCode).toBe(400);
      expect(JSON.parse(response!.body).message).toBe('Invalid value for path parameter: datasetId');
      expect(mockHandle).not.toHaveBeenCalled();
    });

    it('should proceed normally when path parameters are valid', async () => {
      mockHandle.mockReturnValue({ statusCode: 200, headers: {} });
      const mockEvent = {
        headers: {},
        pathParameters: { datasetId: 'abc-123' },
        requestContext: { identity: { user: 'test' } },
      } as unknown as APIGatewayProxyEvent;

      await getApiGatewayHandler(mockHandler)(mockEvent, {} as Context, jest.fn());
      expect(mockHandle).toHaveBeenCalledTimes(1);
    });

    it('should proceed normally when pathParameters is null', async () => {
      mockHandle.mockReturnValue({ statusCode: 200, headers: {} });
      const mockEvent = {
        headers: {},
        pathParameters: null,
        requestContext: { identity: { user: 'test' } },
      } as unknown as APIGatewayProxyEvent;

      await getApiGatewayHandler(mockHandler)(mockEvent, {} as Context, jest.fn());
      expect(mockHandle).toHaveBeenCalledTimes(1);
    });
  });
});
