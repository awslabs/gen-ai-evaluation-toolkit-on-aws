import { ConfigurationDetail, ResourceNotFoundException } from '@awssolutions/gen-ai-evaluation-toolkit-ts-ssdk';
import { updateConfigurationOperation } from '@experiment/api/handlers/updateConfigurationLambda';
import { HandlerContext } from '@common/api/apiGateway';

// Mock the dependencies
jest.mock('@src/common/api/utils', () => ({
  log: {
    info: jest.fn(),
  },
}));

const mockUpdateConfiguration = jest.fn();
const dummyConfig = {
  evaluationConfiguration: {
    appId: 'appId',
    testData: {
      bucketName: 'bucket-name',
      prefix: 'prefix',
    },
    plugins: [],
  },
};

jest.mock('@experiment/api/storage/workflowConfiguration', () => ({
  updateConfiguration: (...props: unknown[]) => mockUpdateConfiguration(...props),
}));

describe('updateConfigurationOperation', () => {
  const mockNow = new Date('2024-01-01T12:00:00Z');
  const context: HandlerContext = { user: 'user-name', requestTime: mockNow };
  const mockConfiguration: ConfigurationDetail = {
    name: 'TestConfig',
    config: dummyConfig,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should successfully update  configuration', async () => {
    // Arrange
    mockUpdateConfiguration.mockResolvedValue(mockConfiguration);
    const input = {
      configuration: mockConfiguration,
    };

    // Act
    const result = await updateConfigurationOperation(input, context);

    // Assert
    expect(result).toEqual({ configuration: mockConfiguration });
    expect(mockUpdateConfiguration).toHaveBeenCalledWith(mockConfiguration, context);
  });

  it('should throw error when configuration is not provided', async () => {
    // Arrange
    const input = { configuration: { name: '', config: dummyConfig } };
    mockUpdateConfiguration.mockRejectedValue(new Error('Configuration is required'));
    // Act & Assert
    await expect(updateConfigurationOperation(input, context)).rejects.toThrow('Configuration is required');
  });

  it('should throw error when file not present', async () => {
    // Arrange
    const input = { configuration: { name: 'xyz', config: dummyConfig } };
    mockUpdateConfiguration.mockRejectedValue(
      new ResourceNotFoundException({ message: 'NoSuchKey: The specified key does not exist' }),
    );

    // Act & Assert
    await expect(updateConfigurationOperation(input, context)).rejects.toThrow(ResourceNotFoundException);
  });
});
