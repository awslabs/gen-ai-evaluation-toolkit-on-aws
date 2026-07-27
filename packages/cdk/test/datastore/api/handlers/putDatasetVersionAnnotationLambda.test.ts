import { putDatasetVersionAnnotationOperation } from '@src/datastore/api/handlers/putDatasetVersionAnnotationLambda';
import {
  assertAnnotationValidity,
  putDatasetVersionAnnotation,
  putTestCaseAnnotation,
} from '@src/datastore/api/helpers';
import { DatasetVersionDdbItem } from '@datastore/api/types';

jest.mock('@datastore/api/helpers');
const mockPutDatasetVersionAnnotation = putDatasetVersionAnnotation as jest.MockedFunction<
  typeof putDatasetVersionAnnotation
>;
const mockAssertAnnotationValidity = assertAnnotationValidity as jest.MockedFunction<typeof assertAnnotationValidity>;

describe('putDatasetVersionAnnotationOperation', () => {
  const mockInput = {
    datasetId: 'dataset-123',
    version: 1,
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

  it('should successfully put an annotation', async () => {
    mockPutDatasetVersionAnnotation.mockResolvedValue({
      annotations: mockAnnotations,
    } as DatasetVersionDdbItem);

    const result = await putDatasetVersionAnnotationOperation(mockInput, mockContext);

    expect(result).toEqual({
      name: mockInput.name,
      value: mockInput.value,
      annotatedBy: mockContext.user,
      annotatedAt: new Date(mockTimestamp),
    });

    expect(mockAssertAnnotationValidity).toHaveBeenCalledWith(mockInput);
    expect(mockPutDatasetVersionAnnotation).toHaveBeenCalledWith(mockInput, mockContext.user);
  });

  it('should throw error when annotation validation fails', async () => {
    const validationError = new Error('Invalid annotation');
    mockAssertAnnotationValidity.mockRejectedValue(validationError);

    await expect(putDatasetVersionAnnotationOperation(mockInput, mockContext)).rejects.toThrow(validationError);

    expect(putTestCaseAnnotation).not.toHaveBeenCalled();
  });
});
