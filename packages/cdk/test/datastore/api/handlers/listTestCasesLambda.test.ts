import { VERSION_HEAD } from '@common/config';
import { listTestCasesOperation } from '@src/datastore/api/handlers/listTestCasesLambda';
import { listTestCaseIdsFromS3, filterTestCases } from '@src/datastore/api/helpers';
import { StringEnumLogicalComparator } from '@awssolutions/gen-ai-evaluation-toolkit-ts-ssdk';

jest.mock('@datastore/api/helpers');
const mockListTestCasesFromS3 = listTestCaseIdsFromS3 as jest.Mock;
const mockFilterTestCases = filterTestCases as jest.Mock;

describe('listTestCasesOperation', () => {
  const mockContext = { user: 'some-user' };
  const mockTestCaseIds = ['T1', 'T2', 'T3'];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should not call filter function when a filter is not provided', async () => {
    mockListTestCasesFromS3.mockResolvedValue({
      testCaseIds: mockTestCaseIds,
      nextContinuationToken: undefined,
    });

    const result = await listTestCasesOperation(
      {
        datasetId: 'test-dataset',
        version: VERSION_HEAD,
        maxResults: 10,
      },
      mockContext,
    );

    expect(mockListTestCasesFromS3).toHaveBeenCalledTimes(1);
    expect(mockFilterTestCases).not.toHaveBeenCalled();
    expect(result.testCases).toStrictEqual(mockTestCaseIds.map((id) => ({ id })));
  });

  it('should filter test cases when a filter is provided', async () => {
    mockListTestCasesFromS3.mockResolvedValue({
      testCaseIds: mockTestCaseIds,
      nextContinuationToken: undefined,
    });
    const filteredTestCaseIds = mockTestCaseIds.slice(1);
    mockFilterTestCases.mockResolvedValue(filteredTestCaseIds);

    const result = await listTestCasesOperation(
      {
        datasetId: 'test-dataset',
        version: VERSION_HEAD,
        maxResults: 10,
        filter: {
          condition: {
            stringEnumCondition: {
              name: 'someName',
              comparator: StringEnumLogicalComparator.EQUAL_TO,
              value: 'someValue',
            },
          },
        },
      },
      mockContext,
    );

    expect(mockListTestCasesFromS3).toHaveBeenCalledTimes(1);
    expect(mockFilterTestCases).toHaveBeenCalledTimes(1);
    expect(result.testCases).toStrictEqual(filteredTestCaseIds.map((id) => ({ id })));
  });

  it('should handle pagination correctly', async () => {
    mockListTestCasesFromS3.mockResolvedValue({
      testCaseIds: mockTestCaseIds,
      nextContinuationToken: 'next-token',
    });

    const result = await listTestCasesOperation(
      {
        datasetId: 'test-dataset',
        version: VERSION_HEAD,
        maxResults: 1,
        nextToken: 'current-token',
      },
      mockContext,
    );

    expect(result.nextToken).toBe('next-token');
  });
});
