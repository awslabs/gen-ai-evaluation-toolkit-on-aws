import { ListExperimentOutputsCommand } from '@awssolutions/gen-ai-evaluation-toolkit-client';
import { getClient } from '@src/client';
import { getExperimentOutput } from '@src/experiment';

// Mock the dependencies
jest.mock('@src/client');

describe('getExperimentOutput', () => {
  // Setup common test variables
  const mockOptions = {
    name: 'test-experiment',
    version: 1,
  };

  const mockResponse = {
    outputs: [
      {
        version: 1,
        configuration: {
          param1: 'value1',
          param2: 'value2',
        },
        runs: [
          {
            run_id: 'run-123',
            metrics: {
              metric1: {
                name1: 'value1',
                name2: 'value2',
              },
            },
          },
        ],
      },
    ],
  };

  // Reset all mocks before each test
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should call client with correct parameters', async () => {
    // Setup
    const mockSend = jest.fn().mockResolvedValue(mockResponse);
    (getClient as jest.Mock).mockReturnValue({ send: mockSend });

    // Execute
    await getExperimentOutput(mockOptions);

    // Verify
    expect(getClient).toHaveBeenCalled();
    expect(mockSend).toHaveBeenCalledWith(expect.any(ListExperimentOutputsCommand));
  });

  it('should throw error when client.send fails', async () => {
    // Setup
    const mockError = new Error('API Error');
    const mockSend = jest.fn().mockRejectedValue(mockError);
    (getClient as jest.Mock).mockReturnValue({ send: mockSend });

    // Execute & Verify
    await expect(getExperimentOutput(mockOptions)).rejects.toThrow('API Error');
  });
});
