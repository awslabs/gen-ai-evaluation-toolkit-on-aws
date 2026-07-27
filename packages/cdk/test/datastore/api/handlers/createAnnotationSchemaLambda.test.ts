import { createAnnotationSchemaOperation } from '@datastore/api/handlers';
import { log } from '@datastore/api/utils/logUtils';
import { createAnnotationSchema } from '@datastore/api/helpers/createOrUpdateEntityHelpers';

// Mock the log utility
jest.mock('@datastore/api/utils/logUtils');
const mockLogInfo = log.info as jest.Mock;

// Mock the createDataset function
jest.mock('@datastore/api/helpers/createOrUpdateEntityHelpers');
const mockCreateAnnotationSchema = createAnnotationSchema as jest.Mock;

const mockContext = {
  user: 'testUser',
};

describe('createAnnotationSchemaOperation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should successfully create string enum type annotations schemas', async () => {
    const mockInput = {
      name: 'test-annotation-schema',
      description: 'test-description',
      valueType: {
        stringType: {
          enum: ['test-value-1', 'test-value-2'],
        },
      },
    };

    const mockAnnotationSchemaResponse = {
      name: 'test-annotation-schema',
      description: 'test-description',
      valueType: {
        string: {
          enum: ['test-value-1', 'test-value-2'],
        },
      },
      createdAt: 1703073600000,
      createdBy: mockContext.user,
      isArchived: false,
    };

    mockCreateAnnotationSchema.mockResolvedValue(mockAnnotationSchemaResponse);

    const result = await createAnnotationSchemaOperation(mockInput, mockContext);

    expect(mockCreateAnnotationSchema).toHaveBeenCalledWith({
      name: 'test-annotation-schema',
      description: 'test-description',
      valueType: {
        string: {
          enum: ['test-value-1', 'test-value-2'],
        },
      },
      createdBy: mockContext.user,
    });

    expect(result).toEqual({
      name: 'test-annotation-schema',
      description: 'test-description',
      valueType: {
        stringType: {
          enum: ['test-value-1', 'test-value-2'],
        },
      },
      createdAt: new Date(1703073600000),
      createdBy: mockContext.user,
      isArchived: false,
    });

    expect(mockLogInfo).toHaveBeenCalledWith(`Creating Annotation Schema: ${mockInput.name}`);
    expect(mockLogInfo).toHaveBeenCalledWith(`Successfully Created Annotation Schema: ${mockInput.name}`);
  });

  it('should successfully create numeric annotations schemas', async () => {
    const mockInput = {
      name: 'test-annotation-schema',
      description: 'test-description',
      valueType: {
        numericType: {},
      },
    };

    const mockAnnotationSchemaResponse = {
      name: 'test-annotation-schema',
      description: 'test-description',
      valueType: {
        number: {},
      },
      createdAt: 1703073600000,
      createdBy: mockContext.user,
      isArchived: false,
    };

    mockCreateAnnotationSchema.mockResolvedValue(mockAnnotationSchemaResponse);

    const result = await createAnnotationSchemaOperation(mockInput, mockContext);

    expect(mockCreateAnnotationSchema).toHaveBeenCalledWith({
      name: 'test-annotation-schema',
      description: 'test-description',
      valueType: {
        number: {},
      },
      createdBy: mockContext.user,
    });

    expect(result).toEqual({
      name: 'test-annotation-schema',
      description: 'test-description',
      valueType: {
        numericType: {},
      },
      createdAt: new Date(1703073600000),
      createdBy: mockContext.user,
      isArchived: false,
    });

    expect(mockLogInfo).toHaveBeenCalledWith(`Creating Annotation Schema: ${mockInput.name}`);
    expect(mockLogInfo).toHaveBeenCalledWith(`Successfully Created Annotation Schema: ${mockInput.name}`);
  });

  it('should throw an error when createAnnotationSchema fails', async () => {
    const mockInput = {
      name: 'test-annotation-schema',
      description: 'test-description',
      valueType: {
        numericType: {},
      },
    };

    const error = new Error('Failed to create dataset');
    mockCreateAnnotationSchema.mockRejectedValue(error);

    await expect(createAnnotationSchemaOperation(mockInput, mockContext)).rejects.toThrow(error.message);
  });
});
