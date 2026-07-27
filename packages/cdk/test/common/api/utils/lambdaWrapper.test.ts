import { ResourceNotFoundException } from '@awssolutions/gen-ai-evaluation-toolkit-ts-ssdk';
import { ExecutionDoesNotExist } from '@aws-sdk/client-sfn';
import { log } from '@src/common/api/utils';
import { applyLambdaDecorators, withExceptionsHandler } from '@src/common/api/utils/lambdaWrapper';

describe('Lambda wrapper tests', () => {
  beforeAll(() => {
    log.error = jest.fn();
  });

  describe('applyLambdaDecorators', () => {
    it('wraps given function with decorators', async () => {
      const fn = jest.fn(async (input) => input + 1);

      const wrapped = applyLambdaDecorators(fn);
      expect(await wrapped(1)).toEqual(2);
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe('withExceptionHandler', () => {
    it('handles not found errors correctly', async () => {
      const fn = async () => {
        // @ts-expect-error empty constructor
        throw new ExecutionDoesNotExist();
      };

      await expect(withExceptionsHandler(fn)).rejects.toThrow(ResourceNotFoundException);
    });

    it('bubbles other errors', async () => {
      const errorMessage = 'custom error';
      const fn = async () => {
        throw new Error(errorMessage);
      };

      await expect(withExceptionsHandler(fn)).rejects.toThrow(errorMessage);
    });
  });
});
