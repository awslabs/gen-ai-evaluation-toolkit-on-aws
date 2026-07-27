import { CreatePresignedMlflowTrackingServerUrlCommand, SageMakerClient } from '@aws-sdk/client-sagemaker';
import { launchExperimentUI } from '@src/mlflow/launchUi';
import { openBrowser } from '@src/mlflow/openBrowser';

jest.mock('@aws-sdk/client-sagemaker');
jest.mock('@src/mlflow/openBrowser');

describe('launchExperimentUI', () => {
  const sageMakerClientMock = jest.mocked(SageMakerClient);
  const mockOpen = jest.mocked(openBrowser);
  const createPresignedMlflowTrackingServerUrlCommandMock = jest.mocked(CreatePresignedMlflowTrackingServerUrlCommand);

  beforeEach(() => {
    sageMakerClientMock.mockClear();
    createPresignedMlflowTrackingServerUrlCommandMock.mockImplementation(
      (command) => command as unknown as CreatePresignedMlflowTrackingServerUrlCommand,
    );
  });

  afterEach(() => jest.resetAllMocks());
  // Mock console methods
  const consoleSpy = {
    log: jest.spyOn(console, 'log').mockImplementation(),
    error: jest.spyOn(console, 'error').mockImplementation(),
  };

  it('should successfully launch MLflow UI', async () => {
    // Mock successful response
    const mockAuthorizedUrl = 'https://example.com/mlflow';
    const mockSend = jest.fn().mockResolvedValue({ AuthorizedUrl: mockAuthorizedUrl });
    sageMakerClientMock.mockImplementation(
      () =>
        ({
          send: mockSend,
        }) as unknown as SageMakerClient,
    );

    // Execute the function
    await launchExperimentUI();

    // Verify SageMaker client was called with correct parameters
    expect(mockSend).toHaveBeenCalledWith({
      ExpiresInSeconds: 300,
      SessionExpirationDurationInSeconds: 3600,
      TrackingServerName: 'GenAiEvaluationToolkitMLFlow',
    });

    // Verify browser was opened with correct URL
    expect(mockOpen).toHaveBeenCalledWith(mockAuthorizedUrl);

    // Verify console output
    expect(consoleSpy.log).toHaveBeenCalledWith(
      'MLflow UI launched in your default browser - if a browser did not launch, you can manually copy/paste this URL: ',
      'https://example.com/mlflow',
    );
  });

  it('should throw error when AuthorizedUrl is missing', async () => {
    // Mock response without AuthorizedUrl
    sageMakerClientMock.mockImplementation(
      () =>
        ({
          send: jest.fn().mockResolvedValue({}),
        }) as unknown as SageMakerClient,
    );

    // Execute and verify error handling
    await expect(launchExperimentUI()).rejects.toThrow('Failed to generate authorized URL');
  });

  it('should handle SageMaker client errors', async () => {
    // Mock SageMaker client error
    const mockError = new Error('SageMaker API error');
    sageMakerClientMock.mockImplementation(
      () =>
        ({
          send: jest.fn().mockRejectedValue(mockError),
        }) as unknown as SageMakerClient,
    );

    // Execute and verify error handling
    await expect(launchExperimentUI()).rejects.toThrow('SageMaker API error');
    expect(consoleSpy.error).toHaveBeenCalledWith('Error launching MLflow UI:', mockError);
  });
});
