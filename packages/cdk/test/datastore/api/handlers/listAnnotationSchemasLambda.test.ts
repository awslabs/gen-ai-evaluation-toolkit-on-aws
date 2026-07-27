import { listAnnotationsSchemasOperation } from '@datastore/api/handlers';

const mockListAnnotationSchemas = jest.fn();
jest.mock('@datastore/api/helpers', () => ({
  listAnnotationSchemas: (...props: unknown[]) => mockListAnnotationSchemas(...props),
}));

const mockAnnotationSchemas = [
  {
    name: 'Schema-1',
    description: 'Test Description',
    createdAt: 1703073600000,
    createdBy: 'user-x',
    isArchived: false,
    valueType: {
      number: {},
    },
  },
  {
    name: 'Schema-2',
    description: 'Test Description',
    createdAt: 1703073600000,
    createdBy: 'user-x',
    isArchived: false,
    valueType: {
      string: {
        enum: ['value_1', 'value_2'],
      },
    },
  },
  {
    name: 'Schema-3',
    description: 'Test Description',
    createdAt: 1703073600000,
    createdBy: 'user-x',
    isArchived: false,
    valueType: {
      number: {},
    },
  },
];

describe('listAnnotationsSchemasOperation', () => {
  const mockContext = { user: 'mock-user' };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should successfully list annotation schemas', async () => {
    mockListAnnotationSchemas.mockResolvedValue({
      entities: mockAnnotationSchemas,
      lastEvaluatedSk: undefined,
    });

    const result = await listAnnotationsSchemasOperation({}, mockContext);

    expect(result).toEqual({
      annotationSchemas: [
        {
          name: 'Schema-1',
          description: 'Test Description',
          createdAt: new Date(1703073600000),
          createdBy: 'user-x',
          isArchived: false,
          valueType: {
            numericType: {},
          },
        },
        {
          name: 'Schema-2',
          description: 'Test Description',
          createdAt: new Date(1703073600000),
          createdBy: 'user-x',
          isArchived: false,
          valueType: {
            stringType: {
              enum: ['value_1', 'value_2'],
            },
          },
        },
        {
          name: 'Schema-3',
          description: 'Test Description',
          createdAt: new Date(1703073600000),
          createdBy: 'user-x',
          isArchived: false,
          valueType: {
            numericType: {},
          },
        },
      ],
      nextToken: undefined,
    });
    expect(mockListAnnotationSchemas).toHaveBeenCalledWith({
      maxResults: undefined,
      lastEvaluatedSk: undefined,
      includeArchived: undefined,
    });
  });

  it('should support pagination', async () => {
    const maxItems = 2;
    const mockFirstPage = mockAnnotationSchemas.slice(0, maxItems);
    const mockSecondPage = mockAnnotationSchemas.slice(mockFirstPage.length, mockFirstPage.length + maxItems);
    mockListAnnotationSchemas
      .mockResolvedValueOnce({
        entities: mockFirstPage,
        lastEvaluatedSk: mockFirstPage[mockFirstPage.length - 1]!.name,
      })
      .mockResolvedValueOnce({
        entities: mockSecondPage,
        lastEvaluatedSk: undefined,
      });

    const firstPage = await listAnnotationsSchemasOperation({ maxResults: maxItems }, mockContext);

    expect(firstPage).toEqual({
      annotationSchemas: [
        {
          name: 'Schema-1',
          description: 'Test Description',
          createdAt: new Date(1703073600000),
          createdBy: 'user-x',
          isArchived: false,
          valueType: {
            numericType: {},
          },
        },
        {
          name: 'Schema-2',
          description: 'Test Description',
          createdAt: new Date(1703073600000),
          createdBy: 'user-x',
          isArchived: false,
          valueType: {
            stringType: {
              enum: ['value_1', 'value_2'],
            },
          },
        },
      ],
      nextToken: mockFirstPage[mockFirstPage.length - 1]!.name,
    });
    expect(mockListAnnotationSchemas).toHaveBeenLastCalledWith({
      maxResults: maxItems,
      lastEvaluatedSk: undefined,
      includeArchived: undefined,
    });

    const secondPage = await listAnnotationsSchemasOperation({ maxResults: maxItems }, mockContext);

    expect(secondPage).toEqual({
      annotationSchemas: [
        {
          name: 'Schema-3',
          description: 'Test Description',
          createdAt: new Date(1703073600000),
          createdBy: 'user-x',
          isArchived: false,
          valueType: {
            numericType: {},
          },
        },
      ],
      nextToken: undefined,
    });
    expect(mockListAnnotationSchemas).toHaveBeenLastCalledWith({
      maxResults: maxItems,
      lastEvaluatedSk: undefined,
      includeArchived: undefined,
    });
  });
});
