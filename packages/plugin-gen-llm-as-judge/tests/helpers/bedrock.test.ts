import { BedrockClient, ModelInvocationJobStatus } from '@aws-sdk/client-bedrock';
import { setTimeout } from 'timers/promises';
import { DEFAULT_POLL_INTERVAL, EnvVariable } from '../../src/constants';
import {
  checkBedrockBatchJobStatus,
  createBedrockBatchJob,
  createModelInput,
  getEnvVariable,
  waitUntilJobTerminates,
} from '../../src/helpers';

jest.mock('timers/promises');

describe('Bedrock Utils', () => {
  const mockSend = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockSend.mockReset();
    BedrockClient.prototype.send = mockSend;

    console.log = jest.fn();
    process.env[EnvVariable.BEDROCK_ROLE_ARN] = 'arn:aws:iam::123456789012:role/service-role/BedrockJobS3Access';
  });

  describe('createBedrockBatchJob', () => {
    const mockRunId = 'test-run-id';
    const mockInputS3Uri = 's3://input-bucket/path';
    const mockOutputS3Uri = 's3://output-bucket/path';
    const mockModelId = 'test-model';
    const mockJobArn = 'test-job-arn';

    it('should create a batch job successfully', async () => {
      mockSend.mockResolvedValueOnce({ jobArn: mockJobArn });

      const result = await createBedrockBatchJob(mockRunId, mockInputS3Uri, mockOutputS3Uri, mockModelId);

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          input: {
            jobName: `etk-testcasevalidation-${mockRunId}`,
            modelId: mockModelId,
            inputDataConfig: {
              s3InputDataConfig: {
                s3Uri: mockInputS3Uri,
                s3InputFormat: 'JSONL',
              },
            },
            outputDataConfig: {
              s3OutputDataConfig: {
                s3Uri: mockOutputS3Uri,
              },
            },
            roleArn: getEnvVariable(EnvVariable.BEDROCK_ROLE_ARN),
            clientRequestToken: mockRunId,
          },
        }),
      );
      expect(result).toBe(mockJobArn);
    });
  });

  describe('checkBedrockBatchJobStatus', () => {
    const mockJobArn = 'test-job-arn';

    it('should return job status', async () => {
      const mockStatus = ModelInvocationJobStatus.IN_PROGRESS;
      mockSend.mockResolvedValueOnce({ status: mockStatus });

      const result = await checkBedrockBatchJobStatus(mockJobArn);

      expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ input: { jobIdentifier: mockJobArn } }));
      expect(result).toBe(mockStatus);
    });
  });

  describe('waitUntilJobTerminates', () => {
    const mockJobArn = 'test-job-arn';
    const mockIntervalMs = 123;

    it('should poll until job completes', async () => {
      mockSend
        .mockResolvedValueOnce({ status: ModelInvocationJobStatus.IN_PROGRESS })
        .mockResolvedValueOnce({ status: ModelInvocationJobStatus.COMPLETED });

      await waitUntilJobTerminates(mockJobArn, undefined, mockIntervalMs);

      expect(mockSend).toHaveBeenCalledTimes(2);
      expect(setTimeout).toHaveBeenCalledWith(mockIntervalMs);
    });

    it('should stop polling on failure status', async () => {
      mockSend
        .mockResolvedValueOnce({ status: ModelInvocationJobStatus.IN_PROGRESS })
        .mockResolvedValueOnce({ status: ModelInvocationJobStatus.FAILED });

      await expect(waitUntilJobTerminates(mockJobArn)).rejects.toThrow(new RegExp(ModelInvocationJobStatus.FAILED));

      expect(mockSend).toHaveBeenCalledTimes(2);
      expect(setTimeout).toHaveBeenCalledWith(DEFAULT_POLL_INTERVAL);
    });

    it('should not poll if status already terminal', async () => {
      mockSend.mockResolvedValueOnce({ status: ModelInvocationJobStatus.STOPPED });

      await expect(waitUntilJobTerminates(mockJobArn, undefined, mockIntervalMs)).rejects.toThrow(
        new RegExp(ModelInvocationJobStatus.STOPPED),
      );

      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(setTimeout).not.toHaveBeenCalled();
    });

    it('should call onStatusChange callback', async () => {
      const onStatusChange = jest.fn();
      mockSend
        .mockResolvedValueOnce({ status: ModelInvocationJobStatus.IN_PROGRESS })
        .mockResolvedValueOnce({ status: ModelInvocationJobStatus.COMPLETED });

      await waitUntilJobTerminates(mockJobArn, onStatusChange, mockIntervalMs);

      expect(onStatusChange).toHaveBeenCalledWith(ModelInvocationJobStatus.IN_PROGRESS);
    });
  });

  describe('createModelInput', () => {
    it('should create correct model input format', () => {
      const mockInput = 'test input';
      const mockPrompt = 'test prompt';
      const mockCriteria = [
        'Input must be a clear, answerable question',
        'Expected output must be supported by the context',
        'Context snippets must contain the information needed for the answer',
      ];
      const mockThreshold = 0.7;

      const result = createModelInput(mockInput, mockPrompt, mockCriteria, mockThreshold);

      expect(result).toEqual({
        modelInput: {
          max_tokens: 4096,
          anthropic_version: 'bedrock-2023-05-31',
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: 'test input',
                },
                {
                  type: 'text',
                  text: expect.stringContaining('test prompt'),
                },
              ],
            },
          ],
        },
      });

      const expectedContent = result.modelInput.messages[0]?.content[1]?.text;

      // Verify prompt content
      expect(expectedContent).toContain('test prompt');

      // Verify criteria are included
      expect(expectedContent).toContain('1. Input must be a clear, answerable question');
      expect(expectedContent).toContain('2. Expected output must be supported by the context');
      expect(expectedContent).toContain('3. Context snippets must contain the information needed for the answer');

      // Verify threshold information
      expect(expectedContent).toContain('meets 70% or more of the criteria');
    });
  });
});
