import { GenAiEvaluationToolkitClient } from '@awssolutions/gen-ai-evaluation-toolkit-client';
import { createGenAiEtkCall } from '@src/cli/genAiEtkCallFactory';
import { getClient } from '@src/client';
import { renderTemplate } from '@src/templates/render';

// Mock all dependencies
jest.mock('@src/client');
jest.mock('@src/templates/render');

describe('genAiEtkCallFactory', () => {
  const sendMock = jest.fn();
  const mockClient = {
    send: sendMock,
  } as unknown as GenAiEvaluationToolkitClient;
  const getClientMock = jest.mocked(getClient);
  const renderTemplateMock = jest.mocked(renderTemplate);
  const commandMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    getClientMock.mockReturnValue(mockClient);
    renderTemplateMock.mockResolvedValue(undefined);
    commandMock.mockImplementation((input) => ({
      input,
      middlewareStack: {},
      resolveMiddleware: jest.fn(),
    }));
  });

  describe('createGenAiEtkCall', () => {
    it('should return a function when called', () => {
      const template = 'test/template';
      const defaultInput = { testParam: 'default' };

      const result = createGenAiEtkCall(commandMock, template, defaultInput);

      expect(typeof result).toBe('function');
      expect(result.name).toBe('invokeGenAiEtkApi');
    });

    it('should create command with merged input and call client.send', async () => {
      const template = 'test/template';
      const defaultInput = { testParam: 'default', optionalParam: 1 };
      const request = { testParam: 'override', newParam: 'added' };
      const mockResponse = {
        $metadata: { requestId: '123', httpStatusCode: 200 },
        result: 'success',
        status: 'success',
      };

      sendMock.mockResolvedValue(mockResponse);

      const invokeApi = createGenAiEtkCall(commandMock, template, defaultInput);
      await invokeApi(request);

      expect(sendMock).toHaveBeenCalledTimes(1);
      expect(commandMock).toHaveBeenCalledWith({
        testParam: 'override', // request overrides default
        optionalParam: 1, // from defaultInput
        newParam: 'added', // from request
      });
    });

    it('should strip $metadata from response and render template', async () => {
      const template = 'test/template';
      const defaultInput = { testParam: 'default' };
      const request = { testParam: 'test' };
      const mockResponse = {
        $metadata: { requestId: '123', httpStatusCode: 200 },
        result: 'test-result',
        status: 'success',
        extraField: 'extra',
      };

      sendMock.mockResolvedValue(mockResponse);

      const invokeApi = createGenAiEtkCall(commandMock, template, defaultInput);
      await invokeApi(request);

      expect(renderTemplateMock).toHaveBeenCalledTimes(1);
      expect(renderTemplateMock).toHaveBeenCalledWith('views/test/template', {
        result: 'test-result',
        status: 'success',
        extraField: 'extra',
        // $metadata should be stripped
      });
    });

    it('should handle empty request object', async () => {
      const template = 'test/template';
      const defaultInput = { testParam: 'default', optionalParam: 42 };
      const request = {};
      const mockResponse = {
        $metadata: { requestId: '123' },
        result: 'empty-request',
        status: 'success',
      };

      sendMock.mockResolvedValue(mockResponse);

      const invokeApi = createGenAiEtkCall(commandMock, template, defaultInput);
      await invokeApi(request);

      expect(commandMock).toHaveBeenCalledWith(defaultInput);
    });

    it('should handle empty defaultInput object', async () => {
      const template = 'test/template';
      const defaultInput = {};
      const request = { testParam: 'only-request', optionalParam: 99 };
      const mockResponse = {
        $metadata: { requestId: '123' },
        result: 'no-defaults',
        status: 'success',
      };

      sendMock.mockResolvedValue(mockResponse);

      const invokeApi = createGenAiEtkCall(commandMock, template, defaultInput);
      await invokeApi(request);

      expect(commandMock).toHaveBeenCalledWith(request);
    });

    it('should propagate errors from client.send', async () => {
      const template = 'test/template';
      const defaultInput = { testParam: 'default' };
      const request = { testParam: 'test' };
      const error = new Error('API call failed');

      sendMock.mockRejectedValue(error);

      const invokeApi = createGenAiEtkCall(commandMock, template, defaultInput);

      await expect(invokeApi(request)).rejects.toThrow('API call failed');
      expect(renderTemplateMock).not.toHaveBeenCalled();
    });

    it('should propagate errors from renderTemplate', async () => {
      const template = 'test/template';
      const defaultInput = { testParam: 'default' };
      const request = { testParam: 'test' };
      const mockResponse = {
        $metadata: { requestId: '123' },
        result: 'success',
        status: 'success',
      };
      const renderError = new Error('Template rendering failed');

      sendMock.mockResolvedValue(mockResponse);
      renderTemplateMock.mockRejectedValue(renderError);

      const invokeApi = createGenAiEtkCall(commandMock, template, defaultInput);

      await expect(invokeApi(request)).rejects.toThrow('Template rendering failed');
    });

    it('should await promise values in request object', async () => {
      const template = 'test/template';
      const defaultInput = { testParam: 'default' };
      const promiseValue = Promise.resolve('resolved-value');
      const request = {
        testParam: promiseValue,
        optionalParam: Promise.resolve(123),
        syncValue: 'immediate',
      };
      const mockResponse = {
        $metadata: { requestId: '123' },
        result: 'promise-test',
        status: 'success',
      };

      sendMock.mockResolvedValue(mockResponse);

      const invokeApi = createGenAiEtkCall(commandMock, template, defaultInput);
      await invokeApi(request);

      expect(commandMock).toHaveBeenCalledWith({
        testParam: 'resolved-value',
        optionalParam: 123,
        syncValue: 'immediate',
      });
    });

    it('should handle response without $metadata gracefully', async () => {
      const template = 'test/template';
      const defaultInput = { testParam: 'default' };
      const request = { testParam: 'test' };
      const mockResponse = {
        result: 'no-metadata',
        status: 'success',
      };

      sendMock.mockResolvedValue(mockResponse);

      const invokeApi = createGenAiEtkCall(commandMock, template, defaultInput);
      await invokeApi(request);

      expect(renderTemplateMock).toHaveBeenCalledWith('views/test/template', mockResponse);
    });

    it('should handle nested template paths correctly', async () => {
      const template = 'deeply/nested/template/path';
      const defaultInput = { testParam: 'default' };
      const request = { testParam: 'test' };
      const mockResponse = {
        $metadata: { requestId: '123' },
        result: 'nested-path',
        status: 'success',
      };

      sendMock.mockResolvedValue(mockResponse);

      const invokeApi = createGenAiEtkCall(commandMock, template, defaultInput);
      await invokeApi(request);

      expect(renderTemplateMock).toHaveBeenCalledWith('views/deeply/nested/template/path', {
        result: 'nested-path',
        status: 'success',
      });
    });
  });

  describe('awaitObjectValues integration', () => {
    it('should resolve mixed promise and non-promise values', async () => {
      const template = 'test/template';
      const defaultInput = { testParam: 'default' };
      const delayedPromise = new Promise((resolve) => setTimeout(() => resolve('delayed'), 10));
      const immediatePromise = Promise.resolve('immediate');
      const request = {
        promiseValue: immediatePromise,
        delayedValue: delayedPromise,
        syncValue: 'synchronous',
        numberValue: 42,
        booleanValue: true,
        nullValue: null,
        undefinedValue: undefined,
      };
      const mockResponse = {
        $metadata: { requestId: '123' },
        result: 'mixed-values',
        status: 'success',
      };

      sendMock.mockResolvedValue(mockResponse);

      const invokeApi = createGenAiEtkCall(commandMock, template, defaultInput);
      await invokeApi(request);

      expect(commandMock).toHaveBeenCalledWith({
        testParam: 'default',
        promiseValue: 'immediate',
        delayedValue: 'delayed',
        syncValue: 'synchronous',
        numberValue: 42,
        booleanValue: true,
        nullValue: null,
        undefinedValue: undefined,
      });
    });

    it('should handle rejected promises in request values', async () => {
      const template = 'test/template';
      const defaultInput = { testParam: 'default' };
      const rejectedPromise = Promise.reject(new Error('Promise rejected'));
      const request = {
        testParam: 'valid',
        failedPromise: rejectedPromise,
      };

      const invokeApi = createGenAiEtkCall(commandMock, template, defaultInput);

      await expect(invokeApi(request)).rejects.toThrow('Promise rejected');
      expect(sendMock).not.toHaveBeenCalled();
    });

    it('should handle empty object correctly', async () => {
      const template = 'test/template';
      const defaultInput = {};
      const request = {};
      const mockResponse = {
        $metadata: { requestId: '123' },
        result: 'empty-objects',
        status: 'success',
      };

      sendMock.mockResolvedValue(mockResponse);

      const invokeApi = createGenAiEtkCall(commandMock, template, defaultInput);
      await invokeApi(request);

      expect(commandMock).toHaveBeenCalledWith({});
    });
  });
});
