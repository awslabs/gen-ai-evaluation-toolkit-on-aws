import { ConfigurationDetail, UnprocessableEntityException } from '@awssolutions/gen-ai-evaluation-toolkit-ts-ssdk';
import { createConfigurationOperation } from '@experiment/api/handlers/createConfigurationLambda';
import { HandlerContext } from '@common/api/apiGateway';

// Mock the dependencies
jest.mock('@src/common/api/utils', () => ({
  log: {
    info: jest.fn(),
  },
}));

const mockCreateConfiguration = jest.fn();
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
  createConfiguration: (...props: unknown[]) => mockCreateConfiguration(...props),
}));

describe('createConfigurationOperation', () => {
  const mockNow = new Date('2024-01-01T12:00:00Z');
  const context: HandlerContext = { user: 'user-name', requestTime: mockNow };

  const mockConfiguration: ConfigurationDetail = {
    name: 'TestConfig',
    config: dummyConfig,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should successfully create configuration', async () => {
    // Arrange
    mockCreateConfiguration.mockResolvedValue(mockConfiguration);
    const input = {
      configuration: mockConfiguration,
    };

    // Act
    const result = await createConfigurationOperation(input, context);

    // Assert
    expect(result).toEqual({ configuration: mockConfiguration });
    expect(mockCreateConfiguration).toHaveBeenCalledWith(mockConfiguration, context);
  });

  it('should throw error when configuration is not provided', async () => {
    // Arrange
    const input = { configuration: { name: '', config: dummyConfig } };
    mockCreateConfiguration.mockRejectedValue(new Error('Configuration is required'));
    // Act & Assert
    await expect(createConfigurationOperation(input, context)).rejects.toThrow('Configuration is required');
  });

  it('should throw error when file already present', async () => {
    // Arrange
    const input = { configuration: { name: 'xyz', config: dummyConfig } };
    mockCreateConfiguration.mockRejectedValue(
      new UnprocessableEntityException({
        message: 'Configuration xyz already exists. Use updateConfiguration to modify existing configurations.',
      }),
    );
    // Act & Assert
    await expect(createConfigurationOperation(input, context)).rejects.toThrow(
      'Configuration xyz already exists. Use updateConfiguration to modify existing configurations.',
    );
  });
});
