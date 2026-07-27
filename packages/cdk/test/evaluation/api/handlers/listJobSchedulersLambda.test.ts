import { ListJobSchedulersServerInput } from '@awssolutions/gen-ai-evaluation-toolkit-ts-ssdk';
import { listJobSchedulersOperation } from '@src/evaluation/api/handlers/listJobSchedulersLambda';
import { SchedulerClient, ListSchedulesCommand } from '@aws-sdk/client-scheduler';
import { HandlerContext } from '@common/api/apiGateway';

// Mock the dependencies
jest.mock('@aws-sdk/client-scheduler');
jest.mock('aws-xray-sdk-core', () => ({
  captureAWSv3Client: jest.fn().mockImplementation((client) => client),
}));

describe('listJobSchedulerHandler', () => {
  const mockNow = new Date('2024-01-01T12:00:00Z');
  const context: HandlerContext = { user: 'user-name', requestTime: mockNow };

  const mockSchedulerClient = {
    send: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (SchedulerClient as jest.Mock).mockImplementation(() => mockSchedulerClient);
  });

  describe('listJobSchedulersOperation', () => {
    it('should list job schedulers from EventBridge Scheduler', async () => {
      // Arrange
      const mockInput: ListJobSchedulersServerInput = {
        nextToken: 'test-next-token',
        maxResults: 2,
      };
      const mockSchedules = [
        {
          Name: 'scheduler-1',
          Description: 'Schedule for job: Scheduler 1',
          CreationDate: new Date('2024-01-01T12:00:00Z'),
        },
        {
          Name: 'scheduler-2',
          Description: 'Schedule for job: Scheduler 2',
          CreationDate: new Date('2024-01-02T12:00:00Z'),
        },
      ];
      mockSchedulerClient.send.mockResolvedValueOnce({
        Schedules: mockSchedules,
        NextToken: 'next-page-token',
      });

      // Act
      const result = await listJobSchedulersOperation(mockInput, context);

      // Assert
      expect(mockSchedulerClient.send).toHaveBeenCalledWith(expect.any(ListSchedulesCommand));
      expect(result).toEqual({
        jobSchedulers: [
          {
            name: 'scheduler-1',
            createdAt: new Date('2024-01-01T12:00:00Z'),
          },
          {
            name: 'scheduler-2',
            createdAt: new Date('2024-01-02T12:00:00Z'),
          },
        ],
        nextToken: 'next-page-token',
      });
    });

    it('should return empty array when no schedules are found', async () => {
      // Arrange
      const mockInput: ListJobSchedulersServerInput = {};
      mockSchedulerClient.send.mockResolvedValueOnce({
        Schedules: [],
      });

      // Act
      const result = await listJobSchedulersOperation(mockInput, context);

      // Assert
      expect(result).toEqual({
        jobSchedulers: [],
      });
    });

    it('should return empty array when Schedules is undefined', async () => {
      // Arrange
      const mockInput: ListJobSchedulersServerInput = {};
      mockSchedulerClient.send.mockResolvedValueOnce({
        Schedules: undefined,
      });

      // Act
      const result = await listJobSchedulersOperation(mockInput, context);

      // Assert
      expect(result).toEqual({
        jobSchedulers: [],
      });
    });

    it('should propagate EventBridge Scheduler errors', async () => {
      // Arrange
      const mockInput: ListJobSchedulersServerInput = {};
      const error = new Error('Scheduler error');
      mockSchedulerClient.send.mockRejectedValueOnce(error);

      // Act & Assert
      await expect(listJobSchedulersOperation(mockInput, context)).rejects.toThrow(error);
    });

    describe('assert statement coverage', () => {
      const nameTestCases = [
        {
          description: 'when schedule Name is missing',
          schedule: { CreationDate: new Date('2024-01-01T12:00:00Z') },
          expectedError: 'Schedule must have a Name property',
        },
        {
          description: 'when schedule Name is null',
          schedule: { Name: null, CreationDate: new Date('2024-01-01T12:00:00Z') },
          expectedError: 'Schedule must have a Name property',
        },
        {
          description: 'when schedule Name is empty string',
          schedule: { Name: '', CreationDate: new Date('2024-01-01T12:00:00Z') },
          expectedError: 'Schedule must have a Name property',
        },
      ];

      const creationDateTestCases = [
        {
          description: 'when schedule CreationDate is missing',
          schedule: { Name: 'scheduler-1' },
          expectedError: 'Schedule must have a CreationDate property',
        },
        {
          description: 'when schedule CreationDate is null',
          schedule: { Name: 'scheduler-1', CreationDate: null },
          expectedError: 'Schedule must have a CreationDate property',
        },
        {
          description: 'when schedule CreationDate is undefined',
          schedule: { Name: 'scheduler-1', CreationDate: undefined },
          expectedError: 'Schedule must have a CreationDate property',
        },
      ];

      describe('Name property validation', () => {
        test.each(nameTestCases)('should throw assertion error $description', async ({ schedule, expectedError }) => {
          // Arrange
          const mockInput: ListJobSchedulersServerInput = {};
          mockSchedulerClient.send.mockResolvedValueOnce({
            Schedules: [schedule],
          });

          // Act & Assert
          await expect(listJobSchedulersOperation(mockInput, context)).rejects.toThrow(expectedError);
        });
      });

      describe('CreationDate property validation', () => {
        test.each(creationDateTestCases)(
          'should throw assertion error $description',
          async ({ schedule, expectedError }) => {
            // Arrange
            const mockInput: ListJobSchedulersServerInput = {};
            mockSchedulerClient.send.mockResolvedValueOnce({
              Schedules: [schedule],
            });

            // Act & Assert
            await expect(listJobSchedulersOperation(mockInput, context)).rejects.toThrow(expectedError);
          },
        );
      });
    });
  });
});
