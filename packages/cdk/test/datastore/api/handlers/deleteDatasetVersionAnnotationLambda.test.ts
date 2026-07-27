import { removeAnnotation } from '@src/datastore/api/helpers';
import { deleteDatasetVersionAnnotationOperation } from '@datastore/api/handlers';

jest.mock('@src/datastore/api/helpers');
const mockRemoveTestCaseAnnotation = removeAnnotation as jest.MockedFunction<typeof removeAnnotation>;

const mockContext = {
  user: 'user-x',
};

describe('deleteDatasetVersionAnnotation', () => {
  it('should call removeTestCaseAnnotation with correct parameters', async () => {
    const request = {
      datasetId: 'dataset-123',
      version: 1,
      annotationName: 'annotation-name',
    };

    await deleteDatasetVersionAnnotationOperation(request, mockContext);

    expect(mockRemoveTestCaseAnnotation).toHaveBeenCalledWith(request);
  });
});
