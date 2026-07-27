import { handler } from '@datastore/lambdas/systemDefinedAnnotationsSeederHandler';
import { createAnnotationSchema } from '@datastore/api/helpers';
import { CloudFormationCustomResourceEvent } from 'aws-lambda';

// Mock the external dependencies
jest.mock('@datastore/api/helpers');

const annotations = [
  {
    name: 'test-annotation-1',
    valueType: {
      stringType: {
        enum: ['some-value-1', 'some-value-2'],
      },
    },
    description: 'Test description 1',
  },
  {
    name: 'test-annotation-2',
    valueType: {
      numericType: {},
    },
    description: 'Test description 2',
  },
];

const createEvent: CloudFormationCustomResourceEvent = {
  RequestType: 'Create',
  ServiceToken: 'dummyToken',
  ResponseURL: 'dummyUrl',
  StackId: 'dummyStackId',
  RequestId: 'dummyRequestId',
  LogicalResourceId: 'dummyLogicalResourceId',
  ResourceType: 'AWS::CloudFormation::CustomResource',
  ResourceProperties: {
    ServiceToken: 'dummyToken',
    annotations: JSON.stringify(annotations),
  },
};

const deleteEvent: CloudFormationCustomResourceEvent = {
  RequestType: 'Delete',
  ServiceToken: 'dummyToken',
  ResponseURL: 'dummyUrl',
  StackId: 'dummyStackId',
  RequestId: 'dummyRequestId',
  LogicalResourceId: 'dummyLogicalResourceId',
  PhysicalResourceId: 'dummyPhysicalResourceId',
  ResourceType: 'AWS::CloudFormation::CustomResource',
  ResourceProperties: {
    ServiceToken: 'dummyToken',
    annotations: JSON.stringify(annotations),
  },
};

describe('Annotation Handler Tests', () => {
  // Clear all mocks before each test
  beforeEach(() => {
    jest.clearAllMocks();
    console.log = jest.fn();
    console.error = jest.fn();
  });

  it('should successfully create annotation schemas', async () => {
    // Mock the createAnnotationSchema implementation
    (createAnnotationSchema as jest.Mock).mockResolvedValue({});

    const response = await handler(createEvent);

    // Verify the response
    expect(response).toEqual({
      statusCode: 200,
      body: JSON.stringify({
        message: 'System-defined annotations added successfully',
      }),
    });

    // Verify createAnnotationSchema was called correct number of times
    expect(createAnnotationSchema).toHaveBeenCalledTimes(annotations.length);

    // Verify createAnnotationSchema was called with correct parameters
    annotations.forEach((annotation, index) => {
      const expectedValueType = annotation.valueType.stringType
        ? { string: annotation.valueType.stringType }
        : { number: annotation.valueType.numericType };

      expect(createAnnotationSchema).toHaveBeenNthCalledWith(index + 1, {
        name: annotation.name,
        valueType: expectedValueType,
        description: annotation.description,
        createdBy: 'System',
      });
    });
  });

  it('should handle Delete request type without performing actions', async () => {
    const response = await handler(deleteEvent);

    // Verify response for Delete
    expect(response).toEqual({
      statusCode: 200,
    });
    // Verify createAnnotationSchema was not called
    expect(createAnnotationSchema).not.toHaveBeenCalled();

    // Verify proper logging
    expect(console.log).toHaveBeenCalledWith('No action needed for Delete RequestType');
  });

  it('should handle errors properly', async () => {
    // Mock createAnnotationSchema to throw an error
    const mockError = new Error('Test error');
    (createAnnotationSchema as jest.Mock).mockRejectedValue(mockError);

    const response = await handler(createEvent);

    // Verify error response
    expect(response).toEqual({
      statusCode: 500,
      body: JSON.stringify({
        message: 'Internal failure',
      }),
    });

    // Verify error was logged
    expect(console.error).toHaveBeenCalledWith('Error:', mockError);
  });

  it('should log the event', async () => {
    await handler(createEvent);

    // Verify event logging
    expect(console.log).toHaveBeenCalledWith('Event:', JSON.stringify(createEvent, null, 2));
  });

  it('should handle invalid annotation schemas', async () => {
    const response = await handler({
      ...createEvent,
      ResourceProperties: {
        ...createEvent.ResourceProperties,
        annotations: JSON.stringify([{}]),
      },
    });

    expect(response).toEqual({
      statusCode: 400,
      body: JSON.stringify({
        message: 'Invalid seeder input',
      }),
    });

    expect(createAnnotationSchema).not.toHaveBeenCalled();
  });
});
