import { TestCase } from '@awssolutions/gen-ai-evaluation-toolkit-ts-ssdk';
import { getTestCaseOperation } from '@src/datastore/api/handlers/getTestCaseLambda';
import {
  getDataset,
  getDatasetVersionS3Path,
  getTestCase,
  getTestCaseAnnotations,
  parseVersionString,
} from '@src/datastore/api/helpers';
import path from 'path';
import { AnnotationContent } from '@datastore/api/types';

// Mock all dependencies
jest.mock('@datastore/api/helpers');
jest.mock('@datastore/api/utils');

describe('getTestCaseOperation', () => {
  const mockContext = { user: 'some-user' };

  const mockInput = {
    datasetId: 'dataset123',
    version: '1',
    testCaseId: 'test123',
  };

  const mockDataset = {};
  const mockVersion = parseInt(mockInput.version);
  const mockVersionPath = `datasets/${mockInput.datasetId}/versions/${mockInput.version}`;

  const mockTestCase: Partial<TestCase> = { input: 'some-input' };

  const mockTestCaseAnnotations: Record<string, AnnotationContent> = {
    someName: {
      value: {
        stringValue: 'someValue',
      },
      annotatedBy: 'user-x',
      annotatedAt: 123456789,
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup default mock implementations
    (getDataset as jest.Mock).mockResolvedValue(mockDataset);
    (parseVersionString as jest.Mock).mockReturnValue(mockVersion);
    (getDatasetVersionS3Path as jest.Mock).mockReturnValue(mockVersionPath);
    (getTestCase as jest.Mock).mockResolvedValue(mockTestCase);
    (getTestCaseAnnotations as jest.Mock).mockResolvedValue({ annotations: mockTestCaseAnnotations });
  });

  it('should successfully get a test case', async () => {
    // Execute
    const result = await getTestCaseOperation(mockInput, mockContext);

    // Assert
    expect(result).toEqual({
      testCaseId: mockInput.testCaseId,
      ...mockTestCase,
      annotations: Object.entries(mockTestCaseAnnotations).map(([name, annotationContent]) => ({
        name,
        ...annotationContent,
        annotatedAt: new Date(annotationContent.annotatedAt!),
      })),
    });
    expect(getDataset).toHaveBeenCalledWith(mockInput.datasetId);
    expect(parseVersionString).toHaveBeenCalledWith(mockInput.version);
    expect(getDatasetVersionS3Path).toHaveBeenCalledWith(mockVersion, mockDataset);
    expect(getTestCase).toHaveBeenCalledWith(path.join(mockVersionPath, `${mockInput.testCaseId}.json`));
    expect(getTestCaseAnnotations).toHaveBeenCalledWith(mockInput.datasetId, mockInput.testCaseId);
  });

  it('should handle test cases which does not annotated', async () => {
    (getTestCaseAnnotations as jest.Mock).mockResolvedValue(undefined);

    // Execute
    const result = await getTestCaseOperation(mockInput, mockContext);

    // Assert
    expect(result).toEqual({
      testCaseId: mockInput.testCaseId,
      ...mockTestCase,
      annotations: undefined,
    });
    expect(getDataset).toHaveBeenCalledWith(mockInput.datasetId);
    expect(parseVersionString).toHaveBeenCalledWith(mockInput.version);
    expect(getDatasetVersionS3Path).toHaveBeenCalledWith(mockVersion, mockDataset);
    expect(getTestCase).toHaveBeenCalledWith(path.join(mockVersionPath, `${mockInput.testCaseId}.json`));
    expect(getTestCaseAnnotations).toHaveBeenCalledWith(mockInput.datasetId, mockInput.testCaseId);
  });
});
