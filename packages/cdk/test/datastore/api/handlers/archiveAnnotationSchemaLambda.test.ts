import { archiveAnnotationSchemaOperation } from '@datastore/api/handlers';
import { archiveAnnotationSchema } from '@datastore/api/helpers/createOrUpdateEntityHelpers';

// Mock the archiveAnnotationSchema function
jest.mock('@datastore/api/helpers/createOrUpdateEntityHelpers');
const mockArchiveAnnotationSchema = archiveAnnotationSchema as jest.Mock;

const mockContext = {
  user: 'testUser',
};

const mockAnnotationSchema = {
  name: 'test-annotation-schema',
  description: 'test-description',
  valueType: {
    string: {
      enum: ['test-value-1', 'test-value-2'],
    },
  },
  createdAt: 1703073600000,
  createdBy: mockContext.user,
  isArchived: true,
};

describe('archiveAnnotationSchemaOperation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should archive annotations schemas', async () => {
    const mockInput = { annotationName: mockAnnotationSchema.name };
    mockArchiveAnnotationSchema.mockResolvedValue(mockAnnotationSchema);

    const result = await archiveAnnotationSchemaOperation(mockInput, mockContext);

    expect(mockArchiveAnnotationSchema).toHaveBeenCalledWith(mockInput.annotationName, true);

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
      isArchived: true,
    });
  });

  it('should un-archive annotations schemas if archive attribute is set to false', async () => {
    const mockInput = { annotationName: mockAnnotationSchema.name, restore: true };
    const unarchivedSchema = { ...mockAnnotationSchema, isArchived: false };
    mockArchiveAnnotationSchema.mockResolvedValue(unarchivedSchema);

    const result = await archiveAnnotationSchemaOperation(mockInput, mockContext);

    expect(mockArchiveAnnotationSchema).toHaveBeenCalledWith(mockInput.annotationName, false);

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
  });
});
