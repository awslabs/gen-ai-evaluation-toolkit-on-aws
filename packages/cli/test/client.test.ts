import { GenAiEvaluationToolkitClient } from '@awssolutions/gen-ai-evaluation-toolkit-client';
import { getClient } from '@src/client';
import { API_GW_ENDPOINT } from '@src/constants';

jest.mock('@awssolutions/gen-ai-evaluation-toolkit-client');

describe('getClient', () => {
  const mockApiUrl = 'https://api.example.com';

  beforeEach(() => {
    jest.clearAllMocks();
    process.env[API_GW_ENDPOINT] = mockApiUrl;
  });

  it('should create a new GenAiEvaluationToolkitClient with the correct configuration', () => {
    // Mock implementation
    (GenAiEvaluationToolkitClient as jest.Mock).mockImplementation(() => ({
      // Mock client methods if needed
    }));

    // Call the function
    const client = getClient();

    // Verify GenAiEvaluationToolkitClient was called with correct parameters
    expect(GenAiEvaluationToolkitClient).toHaveBeenCalledWith({
      endpoint: mockApiUrl,
    });

    // Verify the client was returned
    expect(client).toBeDefined();
  });
});
