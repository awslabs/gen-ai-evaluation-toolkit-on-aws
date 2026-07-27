import { ResourceNotFoundException as SchedulerNotFound } from '@aws-sdk/client-scheduler';
import { ExecutionDoesNotExist } from '@aws-sdk/client-sfn';
import { logErrorAndThrowResourceNotFound, logErrorAndThrowThrottling } from '../exceptions/serviceExceptions';
import { log } from '@common/api/utils';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Func<In = any, Out = any> = (...args: In[]) => Promise<Out>;
type LambdaDecorator<Fn extends Func> = (lambda: Fn) => Fn;

/**
 * Decorates the lambda handler with our defined decorators.
 * This is a centralized location for any common code we want to apply to all lambdas, .e.g common error handling.
 *
 * @param lambda a lambda function handler
 * @returns decorated lambda
 */
export function applyLambdaDecorators<Fn extends Func>(lambda: Fn): Fn {
  // Decorators are applied left to right.
  // That is, the leftmost one is applied (and later: executed) first, then the next and so on
  const decorators: LambdaDecorator<Fn>[] = [withExceptionsHandler];
  return decorators.reduce((result, decorator) => decorator(result), lambda);
}

/**
 * Catches generic errors and throws genai-etk errors instead.
 * Not to be used directly, only to be applied as a part of `applyLambdaDecorators`. Exported for testing.
 *
 * @param lambda a lambda function handler
 * @returns same input lambda but decorated with error handling
 */
export function withExceptionsHandler<Fn extends Func>(lambda: Fn): Fn {
  return async function wrapped(...args: Parameters<Fn>): Promise<ReturnType<Fn>> {
    try {
      return await lambda(...args);
    } catch (err) {
      const NotFoundErrors = [ExecutionDoesNotExist, SchedulerNotFound];
      for (const Err of NotFoundErrors) {
        if (err instanceof Err) {
          logErrorAndThrowResourceNotFound({ externalMessage: 'Resource not found', sourceException: err });
        }
      }

      if (err instanceof Error && err.name == 'ThrottlingException') {
        logErrorAndThrowThrottling({ externalMessage: 'Rate limit exceeded', sourceException: err });
      }

      log.error(`Exception thrown: ${err}`);

      throw err;
    }
  } as Fn;
}
