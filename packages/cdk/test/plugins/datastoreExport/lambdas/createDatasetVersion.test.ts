import { createVersionHandler } from '@plugins/datastoreExport/lambdas';
import { GenAiEvaluationToolkitClient } from '@awssolutions/gen-ai-evaluation-toolkit-ts-client';
import { EnvVariable } from '@common/config';

const mockSend = jest.fn();
GenAiEvaluationToolkitClient.prototype.send = mockSend;

const mockUrl = 'https://genai-etk-api.example.com';
jest.mock('@common', () => ({
  ...jest.requireActual('@common'),
  getEnvVariable: (env: string) => (env === EnvVariable.GENAI_ETK_URL ? mockUrl : env),
}));

describe('createVersionHandler', () => {
  const mockEvent = {
    datasetId: 'test-dataset-id',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('Should initiate the minting process', async () => {
    await createVersionHandler(mockEvent);
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend).toHaveBeenLastCalledWith(
      expect.objectContaining({
        input: {
          datasetId: mockEvent.datasetId,
        },
      }),
    );
  });
});
