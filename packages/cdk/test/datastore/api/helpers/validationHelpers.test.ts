import {
  assertAnnotationValidity,
  assertTestCaseExistence,
  getAnnotationSchema,
  getDataset,
  getTestCaseMetadata,
} from '@datastore/api/helpers';
import {
  logErrorAndThrowValidation,
  logErrorAndThrowResourceNotFound,
  logErrorAndThrowUnprocessableEntity,
} from '@common/api/exceptions/serviceExceptions';
import { AnnotationSchemaDdbItem, DatasetDdbItem } from '@datastore/api/types';

// Mock the getAnnotationSchema function
jest.mock('@datastore/api/helpers/getEntityHelpers');
const mockGetAnnotationSchema = getAnnotationSchema as jest.MockedFunction<typeof getAnnotationSchema>;
const mockGetDataset = getDataset as jest.MockedFunction<typeof getDataset>;
const mockGetTestCaseMetadata = getTestCaseMetadata as jest.MockedFunction<typeof getTestCaseMetadata>;

jest.mock('@common/api/exceptions/serviceExceptions');
const mockLogErrorAndThrowValidation = logErrorAndThrowValidation as jest.MockedFunction<
  typeof logErrorAndThrowValidation
>;
const mockLogErrorAndThrowResourceNotFound = logErrorAndThrowResourceNotFound as jest.MockedFunction<
  typeof logErrorAndThrowResourceNotFound
>;
const mockLogErrorAndThrowUnprocessableEntity = logErrorAndThrowUnprocessableEntity as jest.MockedFunction<
  typeof logErrorAndThrowUnprocessableEntity
>;

describe('assertAnnotationValidity', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  it('should throw error when annotation is archived', async () => {
    mockGetAnnotationSchema.mockResolvedValue({
      isArchived: true,
      valueType: {
        number: {},
      },
    } as AnnotationSchemaDdbItem);

    const annotation = {
      name: 'testAnnotation',
      value: { stringValue: 'test' },
    };

    await assertAnnotationValidity(annotation);
    expect(mockLogErrorAndThrowUnprocessableEntity).toHaveBeenCalledWith({
      externalMessage: "Annotation 'testAnnotation' cannot be used as it is archived.",
    });
  });

  it('should throw error when numeric value is expected but not provided', async () => {
    mockGetAnnotationSchema.mockResolvedValue({
      isArchived: false,
      valueType: {
        number: {},
      },
    } as AnnotationSchemaDdbItem);

    const annotation = {
      name: 'testAnnotation',
      value: { stringValue: 'test' },
    };

    await assertAnnotationValidity(annotation);
    expect(mockLogErrorAndThrowValidation).toHaveBeenCalledWith({
      externalMessage: "Annotation 'testAnnotation' expects a numeric value.",
    });
  });

  it('should throw error when string enum value is expected but a numeric value is provided', async () => {
    mockGetAnnotationSchema.mockResolvedValue({
      isArchived: false,
      valueType: {
        string: {
          enum: ['option1', 'option2', 'option3'],
        },
      },
    } as AnnotationSchemaDdbItem);

    const annotation = {
      name: 'testAnnotation',
      value: { numericValue: 42 },
    };

    await assertAnnotationValidity(annotation);
    expect(mockLogErrorAndThrowValidation).toHaveBeenCalledWith({
      externalMessage: "Annotation 'testAnnotation' expects a value from the enumeration: [option1, option2, option3].",
    });
  });

  it('should throw error when string enum value is invalid', async () => {
    mockGetAnnotationSchema.mockResolvedValue({
      isArchived: false,
      valueType: {
        string: {
          enum: ['option1', 'option2', 'option3'],
        },
      },
    } as AnnotationSchemaDdbItem);

    const annotation = {
      name: 'testAnnotation',
      value: { stringValue: 'invalidOption' },
    };

    await assertAnnotationValidity(annotation);
    expect(mockLogErrorAndThrowValidation).toHaveBeenCalledWith({
      externalMessage: "Annotation 'testAnnotation' expects a value from the enumeration: [option1, option2, option3].",
    });
  });

  it('should pass validation for valid numeric value', async () => {
    mockGetAnnotationSchema.mockResolvedValue({
      isArchived: false,
      valueType: {
        number: {},
      },
    } as AnnotationSchemaDdbItem);

    const annotation = {
      name: 'testAnnotation',
      value: { numericValue: 42 },
    };

    await assertAnnotationValidity(annotation);
    expect(mockLogErrorAndThrowValidation).not.toHaveBeenCalled();
  });

  it('should pass validation for valid string enum value', async () => {
    mockGetAnnotationSchema.mockResolvedValue({
      isArchived: false,
      valueType: {
        string: {
          enum: ['option1', 'option2', 'option3'],
        },
      },
    } as AnnotationSchemaDdbItem);

    const annotation = {
      name: 'testAnnotation',
      value: { stringValue: 'option1' },
    };

    await assertAnnotationValidity(annotation);
    expect(mockLogErrorAndThrowValidation).not.toHaveBeenCalled();
  });
});

describe('assertTestCaseExistence', () => {
  // Reset all mocks before each test
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should not throw when test case exists at least in one of the minted versions', async () => {
    // Mock getDataset to return version 2
    mockGetDataset.mockResolvedValueOnce({ currentVersion: 2 } as DatasetDdbItem);

    // Mock getTestCaseMetadata to fail for current version but succeed for a previous version
    mockGetTestCaseMetadata
      .mockRejectedValueOnce(new Error('Not found')) // rejects for version 1
      .mockResolvedValueOnce({}); // resolves for version 2

    await assertTestCaseExistence('dataset-123', 'test-case-456');
    expect(mockLogErrorAndThrowResourceNotFound).not.toHaveBeenCalled();
    expect(mockGetTestCaseMetadata).toHaveBeenCalledTimes(2);
  });

  it('should throw resource not found error when test case is not found in any minted version', async () => {
    // Mock getDataset to return version 1
    mockGetDataset.mockResolvedValueOnce({ currentVersion: 1 } as DatasetDdbItem);

    // Mock getTestCaseMetadata to fail for all versions
    mockGetTestCaseMetadata.mockRejectedValue(new Error('Not found'));

    await assertTestCaseExistence('dataset-123', 'test-case-456');
    expect(mockLogErrorAndThrowResourceNotFound).toHaveBeenCalledWith({
      externalMessage: "Test case 'test-case-456' not found in any minted version of dataset 'dataset-123'.",
    });
    expect(mockGetTestCaseMetadata).toHaveBeenCalledTimes(1);
  });

  it('should handle dataset with no minted versions', async () => {
    // Mock getDataset to return no version
    mockGetDataset.mockResolvedValue({ currentVersion: undefined } as DatasetDdbItem);

    await assertTestCaseExistence('dataset-123', 'test-case-456');
    expect(mockLogErrorAndThrowResourceNotFound).toHaveBeenCalledWith({
      externalMessage: "Minted versions are not found in dataset 'dataset-123'.",
    });
    expect(mockGetTestCaseMetadata).not.toHaveBeenCalled();
  });
});
