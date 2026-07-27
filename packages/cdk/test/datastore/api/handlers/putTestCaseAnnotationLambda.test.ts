import { putTestCaseAnnotationOperation } from '@datastore/api/handlers';
import { assertAnnotationValidity, assertTestCaseExistence, putTestCaseAnnotation } from '@datastore/api/helpers';
import { TestCaseAnnotationDdbItem } from '@datastore/api/types';

// Mock the dependencies
jest.mock('@datastore/api/helpers');
const mockPutTestCaseAnnotation = putTestCaseAnnotation as jest.MockedFunction<typeof putTestCaseAnnotation>;
const mockAssertAnnotationValidity = assertAnnotationValidity as jest.MockedFunction<typeof assertAnnotationValidity>;
const mockAssertTestCaseExistence = assertTestCaseExistence as jest.MockedFunction<typeof assertTestCaseExistence>;

describe('putTestCaseAnnotationOperation', () => {
  // Setup common test data
  const mockInput = {
    datasetId: 'dataset-123',
    testCaseId: 'test-123',
    name: 'annotationName',
    value: {
      stringValue: 'annotationValue',
    },
  };

  const mockContext = {
    user: 'testUser',
  };
  const mockTimestamp = 123456789;

  const mockAnnotations = {
    [mockInput.name]: {
      value: mockInput.value,
      annotatedBy: mockContext.user,
      annotatedAt: mockTimestamp,
    },
  };

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('should successfully create an annotation', async () => {
    mockPutTestCaseAnnotation.mockResolvedValue({
      annotations: mockAnnotations,
    } as TestCaseAnnotationDdbItem);

    const result = await putTestCaseAnnotationOperation(mockInput, mockContext);

    expect(result).toEqual({
      name: mockInput.name,
      value: mockInput.value,
      annotatedBy: mockContext.user,
      annotatedAt: new Date(mockTimestamp),
    });

    expect(mockAssertAnnotationValidity).toHaveBeenCalledWith(mockInput);
    expect(mockAssertTestCaseExistence).toHaveBeenCalledWith(mockInput.datasetId, mockInput.testCaseId);
    expect(mockPutTestCaseAnnotation).toHaveBeenCalledWith(mockInput, mockContext.user);
  });

  it('should throw error when annotation validation fails', async () => {
    const validationError = new Error('Invalid annotation');
    mockAssertAnnotationValidity.mockRejectedValue(validationError);

    await expect(putTestCaseAnnotationOperation(mockInput, mockContext)).rejects.toThrow(validationError);

    expect(putTestCaseAnnotation).not.toHaveBeenCalled();
  });

  it('should throw error when test case does not exist', async () => {
    const existenceError = new Error('Test case not found');
    mockAssertTestCaseExistence.mockRejectedValue(existenceError);

    await expect(putTestCaseAnnotationOperation(mockInput, mockContext)).rejects.toThrow(existenceError);

    expect(putTestCaseAnnotation).not.toHaveBeenCalled();
  });
});
