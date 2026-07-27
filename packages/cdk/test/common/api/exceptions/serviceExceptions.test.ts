import {
  ConflictException,
  InternalServerException,
  ResourceNotFoundException,
  ThrottlingException,
  UnauthorizedException,
  ValidationException,
} from '@awssolutions/gen-ai-evaluation-toolkit-ts-ssdk';
import {
  logErrorAndThrowConflict,
  logErrorAndThrowInternalServer,
  logErrorAndThrowResourceNotFound,
  logErrorAndThrowServiceException,
  logErrorAndThrowThrottling,
  logErrorAndThrowUnauthorized,
  logErrorAndThrowValidation,
} from '@common/api/exceptions/serviceExceptions';
import { log } from '@common/api/utils/logUtils';
import { ServiceException as BaseException } from '@aws-smithy/server-common';
import { ExceptionOptionType } from '@smithy/smithy-client';

// Mock the log utility
jest.mock('@common/api/utils/logUtils', () => ({
  log: {
    error: jest.fn(),
  },
}));

class MockSmithyException extends BaseException {
  constructor(opts: ExceptionOptionType<MockSmithyException, BaseException>) {
    super({ ...opts, name: 'MockSmithyException', $fault: 'server' });
  }
}

describe('Service Exceptions', () => {
  beforeEach(() => {
    // Clear mock calls between tests
    jest.clearAllMocks();
  });

  it('logErrorAndThrowServiceException - should throw with external message and log the external message when internal message is not provided', () => {
    const props = {
      externalMessage: 'External error message',
      errorClass: MockSmithyException,
    };

    expect(() => {
      logErrorAndThrowServiceException({ ...props, errorClass: MockSmithyException });
    }).toThrow(props.externalMessage);

    expect(log.error).toHaveBeenCalledWith(props.externalMessage);
  });

  it('logErrorAndThrowServiceException - should include internal message in logs when provided', () => {
    const props = {
      internalMessage: 'Internal error message',
      externalMessage: 'External error message',
      errorClass: MockSmithyException,
    };

    expect(() => {
      logErrorAndThrowServiceException(props);
    }).toThrow(props.externalMessage);

    expect(log.error).toHaveBeenCalledWith(props.internalMessage);
  });

  it('logErrorAndThrowServiceException - should handle source exception without exposing details', () => {
    const sourceError = new Error('Source error');
    const props = {
      externalMessage: 'External error message',
      sourceException: sourceError,
      errorClass: MockSmithyException,
    };

    expect(() => {
      logErrorAndThrowServiceException(props);
    }).toThrow(props.externalMessage);

    expect(log.error).toHaveBeenCalledWith(expect.stringContaining(props.externalMessage));
    expect(log.error).toHaveBeenCalledWith(expect.stringContaining(props.sourceException.message));
  });

  it('logErrorAndThrowServiceException - should expose source exception message when externalizeExceptionMessage is true', () => {
    const sourceError = new Error('Source error');
    const props = {
      externalMessage: 'External error message',
      sourceException: sourceError,
      externalizeExceptionMessage: true,
      errorClass: MockSmithyException,
    };

    expect(() => {
      logErrorAndThrowServiceException(props);
    }).toThrow(`${props.externalMessage}: ${props.sourceException.message}`);
  });

  it.concurrent.each([
    [logErrorAndThrowInternalServer, InternalServerException],
    [logErrorAndThrowValidation, ValidationException],
    [logErrorAndThrowConflict, ConflictException],
    [logErrorAndThrowResourceNotFound, ResourceNotFoundException],
    [logErrorAndThrowThrottling, ThrottlingException],
    [logErrorAndThrowUnauthorized, UnauthorizedException],
  ])('%p', (errorFunction, error) => {
    const props = {
      internalMessage: 'Internal error message',
      externalMessage: 'External error message',
    };

    expect(() => {
      errorFunction(props);
    }).toThrow(error);
  });
});
