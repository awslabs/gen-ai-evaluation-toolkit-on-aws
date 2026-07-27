import { ConfigurationDetail, ResourceNotFoundException } from '@awssolutions/gen-ai-evaluation-toolkit-ts-ssdk';
import { getConfigurationOperation } from '@experiment/api/handlers/getConfigurationLambda';
import { HandlerContext } from '@common/api/apiGateway';

// Mock the dependencies
jest.mock('@src/common/api/utils', () => ({
  log: {
    info: jest.fn(),
  },
}));

const mockGetConfiguration = jest.fn();
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
  getConfiguration: (...props: unknown[]) => mockGetConfiguration(...props),
}));

describe('getConfigurationOperation', () => {
  const mockNow = new Date('2024-01-01T12:00:00Z');
  const context: HandlerContext = { user: 'user-name', requestTime: mockNow };
  const mockConfiguration: ConfigurationDetail = {
    name: 'TestConfig',
    config: dummyConfig,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should successfully get configuration', async () => {
    // Arrange
    mockGetConfiguration.mockResolvedValue(mockConfiguration);
    const input = {
      name: 'test',
      version: 1,
    };
    // Act
    const result = await getConfigurationOperation(input, context);

    // Assert
    expect(result).toEqual({ configuration: mockConfiguration });
    expect(mockGetConfiguration).toHaveBeenCalledWith(input.name, input.version);
  });

  it('should throw error when config is not present', async () => {
    // Arrange
    const input = { name: 'test' };
    mockGetConfiguration.mockRejectedValue(
      new ResourceNotFoundException({ message: 'NoSuchKey: The specified key does not exist' }),
    );
    // Act & Assert
    await expect(getConfigurationOperation(input, context)).rejects.toThrow(ResourceNotFoundException);
  });

  it('should throw error when given version is not present', async () => {
    // Arrange
    const input = { name: 'Experiment1', version: 2 };
    mockGetConfiguration.mockRejectedValue(
      new ResourceNotFoundException({ message: 'Version 2 not found for configuration Experiment1' }),
    );
    // Act & Assert
    await expect(getConfigurationOperation(input, context)).rejects.toThrow(ResourceNotFoundException);
  });
});
