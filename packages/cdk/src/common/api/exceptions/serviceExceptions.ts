import {
  ConflictException,
  InternalServerException,
  ResourceNotFoundException,
  ThrottlingException,
  UnauthorizedException,
  UnprocessableEntityException,
  ValidationException,
} from '@awssolutions/gen-ai-evaluation-toolkit-ts-ssdk';
import { ServiceException as BaseException } from '@aws-smithy/server-common';
import { log } from '@common/api/utils/logUtils';

export type ServiceExceptionConstructor = new (opts: { message: string }) => BaseException;
type ServiceExceptionType<T extends ServiceExceptionConstructor> = T;

export type LogAndThrowProps = {
  internalMessage?: string;
  externalMessage: string;
  sourceException?: Error;
  externalizeExceptionMessage?: boolean;
};

/**
 * Log an (internal) error message and deliver a public error message to the client by throwing a specific error class.
 * Constructs the internal error log message based on values in `internalMessage` and `sourceException`.
 * Defaulting to using the `externalMessage`. `externalMessage` is delivered as-is to the client if `externalizeExceptionMessage` is not set; either way it
 * should be carefully considered to limit information exposure.
 * @param props LogAndThrowProps
 * @returns always throws an error/exception and never returns
 */
export function logErrorAndThrowServiceException<T extends ServiceExceptionConstructor>(
  props: LogAndThrowProps & { errorClass: ServiceExceptionType<T> },
): never {
  let logMessage = props.internalMessage ?? props.externalMessage;
  let externalMessage = props.externalMessage;

  if (props.sourceException) {
    logMessage += `: ${props.sourceException.message}: ${props.sourceException.stack}`;
    if (props.externalizeExceptionMessage) {
      externalMessage += `: ${props.sourceException.message}`;
    }
  }

  log.error(logMessage);

  const ERROR_CLASS = props.errorClass;
  // Based on the way the Smithy errors are defined, the message sent to the caller is held in the `.message` attribute, not the
  // default error message to the constructor
  throw new ERROR_CLASS({ message: externalMessage });
}

/**
 * Function for Logging and Throwing Internal Server Exception
 * @param props {LogAndThrowProps}
 * @returns always throws an error/exception and never returns
 */
export function logErrorAndThrowInternalServer(props: LogAndThrowProps): never {
  logErrorAndThrowServiceException({ ...props, errorClass: InternalServerException });
}

/**
 * Function for Logging and Throwing Validation Exception
 * @param props {LogAndThrowProps}
 * @returns always throws an error/exception and never returns
 */
export function logErrorAndThrowValidation(props: LogAndThrowProps): never {
  logErrorAndThrowServiceException({ ...props, errorClass: ValidationException });
}

/**
 * Function for Logging and Throwing Unauthorized Exception
 * @param props {LogAndThrowProps}
 * @returns always throws an error/exception and never returns
 */
export function logErrorAndThrowUnauthorized(props: LogAndThrowProps): never {
  logErrorAndThrowServiceException({ ...props, errorClass: UnauthorizedException });
}

/**
 * Function for Logging and Throwing Resource Not Found Exception
 * @param props {LogAndThrowProps}
 * @returns always throws an error/exception and never returns
 */
export function logErrorAndThrowResourceNotFound(props: LogAndThrowProps): never {
  logErrorAndThrowServiceException({ ...props, errorClass: ResourceNotFoundException });
}

/**
 * Function for Logging and Throwing Throttling Exception
 * @param props {LogAndThrowProps}
 * @returns always throws an error/exception and never returns
 */
export function logErrorAndThrowThrottling(props: LogAndThrowProps): never {
  logErrorAndThrowServiceException({ ...props, errorClass: ThrottlingException });
}

/**
 * Function for Logging and Throwing Conflict Exception
 * @param props {LogAndThrowProps}
 * @returns always throws an error/exception and never returns
 */
export function logErrorAndThrowConflict(props: LogAndThrowProps): never {
  logErrorAndThrowServiceException({ ...props, errorClass: ConflictException });
}

/**
 * Function for Logging and Throwing Unprocessable entity Exception
 * @param props {LogAndThrowProps}
 * @returns always throws an error/exception and never returns
 */
export function logErrorAndThrowUnprocessableEntity(props: LogAndThrowProps): never {
  logErrorAndThrowServiceException({ ...props, errorClass: UnprocessableEntityException });
}
