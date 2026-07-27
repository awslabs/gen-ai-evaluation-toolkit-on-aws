import { getAnnotationSchemaOperation } from '@datastore/api/handlers';
import { log } from '@datastore/api/utils/logUtils';
import { getAnnotationSchema } from '@datastore/api/helpers/getEntityHelpers';

jest.mock('@datastore/api/utils/logUtils');
const mockLogInfo = log.info as jest.Mock;

// const mockGetDataset = jest.fn();
jest.mock('@datastore/api/helpers/getEntityHelpers');
const mockGetAnnotationSchema = getAnnotationSchema as jest.Mock;

describe('getAnnotationSchemaOperation', () => {
  const mockContext = { user: 'mock-user' };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should successfully return the annotation schema when a valid name is provided', async () => {
    const input = { annotationName: 'TestAnnotation' };
    const mockAnnotationSchema = {
      name: input.annotationName,
      description: 'Test Description',
      createdAt: 1703073600000,
      createdBy: 'user-x',
      valueType: { number: {} },
      isArchived: false,
    };
    mockGetAnnotationSchema.mockResolvedValue(mockAnnotationSchema);

    const result = await getAnnotationSchemaOperation(input, mockContext);

    expect(result).toEqual({
      name: input.annotationName,
      description: 'Test Description',
      createdAt: new Date(1703073600000),
      createdBy: 'user-x',
      valueType: { numericType: {} },
      isArchived: false,
    });
    expect(mockGetAnnotationSchema).toHaveBeenCalledWith(input.annotationName);
    expect(mockLogInfo).toHaveBeenCalledWith('Fetching Annotation Schema "TestAnnotation"');
  });
});
