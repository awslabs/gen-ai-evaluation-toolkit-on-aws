import { CreateJobSchedulerServerInput, JobType } from '@awssolutions/gen-ai-evaluation-toolkit-ts-ssdk';
import { CreateScheduleCommand } from '@aws-sdk/client-scheduler';
import { createJobSchedulerOperation } from '@src/evaluation/api/handlers/createJobSchedulerLambda';
import { HandlerContext } from '@common/api/apiGateway';

const mockSend = jest.fn();

jest.mock('@common', () => {
  const actual = jest.requireActual('@common');
  return {
    ...actual,
    getEnvVariable: jest.fn(() => 'mock-env-value'),
    schedulerClient: jest.fn(() => ({ send: mockSend })),
  };
});
jest.mock('aws-xray-sdk-core', () => ({
  captureAWSv3Client: jest.fn().mockImplementation((client) => client),
}));

describe('createJobSchedulerHandler', () => {
  const mockNow = new Date('2024-01-01T12:00:00Z');
  const context: HandlerContext = { user: 'user-name', requestTime: mockNow };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createJobSchedulerOperation', () => {
    it('should create a schedule for a valid FULL job template', async () => {
      const mockInput: CreateJobSchedulerServerInput = {
        cron: '0 0 * * ? *',
        jobType: JobType.FULL,
        evaluatorName: 'builtin',
        testCases: { inline: [{ input: { q: 'hello' } }] },
        scorers: { llm_as_judge: { scores: { sample: {} } } },
      };
      mockSend.mockResolvedValueOnce({});

      const result = await createJobSchedulerOperation(mockInput, context);

      expect(mockSend).toHaveBeenCalledWith(expect.any(CreateScheduleCommand));
      expect(result.jobType).toBe(JobType.FULL);
      expect(result.evaluatorName).toBe('builtin');
      expect(result.scorers).toEqual(mockInput.scorers);
      expect(result.createdAt).toBe(mockNow);
    });

    it('should propagate EventBridge Scheduler errors', async () => {
      const mockInput: CreateJobSchedulerServerInput = {
        cron: '0 0 * * ? *',
        jobType: JobType.APP_INVOKE,
        evaluatorName: 'builtin',
        testCases: { inline: [{ input: { q: 'hello' } }] },
      };
      const error = new Error('Scheduler error');
      mockSend.mockRejectedValueOnce(error);

      await expect(createJobSchedulerOperation(mockInput, context)).rejects.toThrow(error);
    });

    it('should reject FULL jobs missing scorers', async () => {
      const mockInput: CreateJobSchedulerServerInput = {
        cron: '0 0 * * ? *',
        jobType: JobType.FULL,
        evaluatorName: 'builtin',
        testCases: { inline: [{ input: { q: 'hello' } }] },
      };

      await expect(createJobSchedulerOperation(mockInput, context)).rejects.toThrow(
        /FULL job requires at least one scorer/,
      );
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('should reject SCORE jobs missing sourceReportId and testResults', async () => {
      const mockInput: CreateJobSchedulerServerInput = {
        cron: '0 0 * * ? *',
        jobType: JobType.SCORE,
        evaluatorName: 'builtin',
        scorers: { ragas: null },
      };

      await expect(createJobSchedulerOperation(mockInput, context)).rejects.toThrow(
        /SCORE job requires sourceReportId or testResults/,
      );
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('should reject empty inline test cases', async () => {
      const mockInput: CreateJobSchedulerServerInput = {
        cron: '0 0 * * ? *',
        jobType: JobType.APP_INVOKE,
        evaluatorName: 'builtin',
        testCases: { inline: [] },
      };

      await expect(createJobSchedulerOperation(mockInput, context)).rejects.toThrow(
        /testCases.inline must contain at least one test case/,
      );
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('should reject dataset references without datasetId', async () => {
      const mockInput = {
        cron: '0 0 * * ? *',
        jobType: JobType.APP_INVOKE,
        evaluatorName: 'builtin',
        testCases: { dataset: {} },
      } as unknown as CreateJobSchedulerServerInput;

      await expect(createJobSchedulerOperation(mockInput, context)).rejects.toThrow(
        /testCases.dataset.datasetId is required/,
      );
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('should reject scorer configurations that are not objects', async () => {
      const mockInput = {
        cron: '0 0 * * ? *',
        jobType: JobType.FULL,
        evaluatorName: 'builtin',
        testCases: { inline: [{ input: { q: 'hello' } }] },
        scorers: { toxicity: 'not-an-object' },
      } as unknown as CreateJobSchedulerServerInput;

      await expect(createJobSchedulerOperation(mockInput, context)).rejects.toThrow(
        /Invalid scorer configuration for scorer 'toxicity'/,
      );
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('should report all validation errors at once', async () => {
      const mockInput = {
        cron: '0 0 * * ? *',
        jobType: JobType.FULL,
        evaluatorName: 'builtin',
        testCases: { inline: [] },
      } as unknown as CreateJobSchedulerServerInput;

      await expect(createJobSchedulerOperation(mockInput, context)).rejects.toThrow(
        /testCases.inline must contain at least one test case; FULL job requires at least one scorer/,
      );
      expect(mockSend).not.toHaveBeenCalled();
    });
  });
});
