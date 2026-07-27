import { deleteTestCaseAnnotationsOperation } from '@datastore/api/handlers';
import { removeAnnotation } from '@datastore/api/helpers';

jest.mock('@datastore/api/helpers');
const mockRemoveTestCaseAnnotation = removeAnnotation as jest.MockedFunction<typeof removeAnnotation>;

const mockContext = {
  user: 'user-x',
};

describe('deleteTestCaseAnnotationsOperation', () => {
  it('should call removeTestCaseAnnotation with correct parameters', async () => {
    const request = {
      datasetId: 'dataset-123',
      testCaseId: 'test-case-456',
      annotationName: 'annotation-name',
    };

    await deleteTestCaseAnnotationsOperation(request, mockContext);

    expect(mockRemoveTestCaseAnnotation).toHaveBeenCalledWith(request);
  });
});
