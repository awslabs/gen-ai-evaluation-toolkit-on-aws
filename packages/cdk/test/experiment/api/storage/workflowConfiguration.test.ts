import {
  ConfigurationDetail,
  ConditionExpression,
  WorkflowConfiguration,
} from '@awssolutions/gen-ai-evaluation-toolkit-ts-ssdk';
import { ConfigurationRepository } from '@experiment/api/storage/configurationRepository';
import {
  createConfiguration,
  getConfiguration,
  listConfigurations,
  updateConfiguration,
} from '@experiment/api/storage/workflowConfiguration';
import { HandlerContext } from '@common/api/apiGateway';

jest.mock('@common/lazy', () => ({
  lazy: jest.fn().mockImplementation((factory) => () => factory()),
}));
jest.mock('@experiment/api/storage/configurationRepository');

describe('Workflow Configuration', () => {
  const mockNow = new Date('2024-01-01T12:00:00Z');
  const context: HandlerContext = { user: 'user-name', requestTime: mockNow };
  const workflowConfig: WorkflowConfiguration = {
    evaluationConfiguration: {
      testData: {
        bucketName: '',
        prefix: '',
      },
      plugins: [],
    },
  };
  const mockCreate = jest.fn();
  const mockGet = jest.fn();
  const mockList = jest.fn();
  const mockUpdate = jest.fn();

  const mockConfigRepoInstance = {
    create: mockCreate,
    get: mockGet,
    list: mockList,
    update: mockUpdate,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (ConfigurationRepository as jest.Mock).mockImplementation(() => mockConfigRepoInstance);
  });

  describe('createConfiguration', () => {
    it('should create a new configuration through repository', async () => {
      const config: ConfigurationDetail = {
        name: 'test-config',
        version: 1,
        config: workflowConfig,
      };
      mockCreate.mockResolvedValue(config);

      const result = await createConfiguration(config, context);

      expect(result).toEqual(config);
      expect(mockCreate).toHaveBeenCalledWith(config, context);
    });
  });

  describe('getConfiguration', () => {
    it('should get a configuration through repository', async () => {
      const config: ConfigurationDetail = {
        name: 'test-config',
        version: 1,
        config: workflowConfig,
      };
      mockGet.mockResolvedValue({ config, etag: 'some-etag-value' });

      const result = await getConfiguration('test-config');

      expect(result).toEqual(config);
      expect(mockGet).toHaveBeenCalledWith({
        name: 'test-config',
        version: undefined,
      });
    });

    it('should get a specific version of configuration through repository', async () => {
      const config: ConfigurationDetail = {
        name: 'test-config',
        version: 2,
        config: workflowConfig,
      };
      mockGet.mockResolvedValue({ config, etag: 'some-etag-value' });

      const result = await getConfiguration('test-config', 2);

      expect(result).toEqual(config);
      expect(mockGet).toHaveBeenCalledWith({
        name: 'test-config',
        version: 2,
      });
    });

    it('should propagate repository errors', async () => {
      const error = new Error('Resource not found');
      mockGet.mockRejectedValue(error);

      await expect(getConfiguration('non-existent')).rejects.toThrow(error);
    });
  });

  describe('listConfigurations', () => {
    it('should list configurations through repository', async () => {
      const configs: ConfigurationDetail[] = [
        {
          name: 'config1',
          version: 1,
          config: workflowConfig,
        },
        {
          name: 'config2',
          version: 2,
          config: workflowConfig,
        },
      ];

      mockList.mockResolvedValue({
        items: configs,
        continuationToken: 'next-page-token',
      });

      const result = await listConfigurations({});

      expect(result).toEqual({
        configurations: configs,
        nextToken: 'next-page-token',
      });
      expect(mockList).toHaveBeenCalledWith({});
    });

    it('should list configurations with name filter', async () => {
      const configs = [{ name: 'test-config', version: 1 }];

      mockList.mockResolvedValue({
        items: configs,
        continuationToken: undefined,
      });

      const result = await listConfigurations({ name: 'test' });

      expect(result).toEqual({
        configurations: configs,
        nextToken: undefined,
      });
      expect(mockList).toHaveBeenCalledWith({ name: 'test' });
    });

    it('should pass all parameters to the repository', async () => {
      const filter: ConditionExpression = {
        condition: {
          numericCondition: {
            name: 'version',
            value: 2,
            comparator: '=',
          },
        },
      };

      mockList.mockResolvedValue({
        items: [],
        continuationToken: undefined,
      });

      await listConfigurations({
        name: 'test',
        maxResults: 5,
        nextToken: 'page-token',
        filter,
      });

      expect(mockList).toHaveBeenCalledWith({
        name: 'test',
        maxResults: 5,
        nextToken: 'page-token',
        filter,
      });
    });
  });

  describe('updateConfiguration', () => {
    it('should update an existing configuration through repository', async () => {
      const updatedConfig: ConfigurationDetail = {
        name: 'test-config',
        version: 2,
        config: {
          evaluationConfiguration: {
            appId: 'updated-app-id',
            testData: {
              bucketName: 'bucket-name',
              prefix: 'prefix',
            },
            plugins: [],
          },
        },
      };

      mockUpdate.mockResolvedValue(updatedConfig);

      const configToUpdate: ConfigurationDetail = {
        name: 'test-config',
        config: {
          evaluationConfiguration: {
            appId: 'updated-app-id',
            testData: {
              bucketName: 'bucket-name',
              prefix: 'prefix',
            },
            plugins: [],
          },
        },
      };

      const result = await updateConfiguration(configToUpdate, context);

      expect(result).toEqual(updatedConfig);
      expect(mockUpdate).toHaveBeenCalledWith(configToUpdate, context);
    });

    it('should propagate repository errors', async () => {
      const configToUpdate: ConfigurationDetail = {
        name: 'non-existent',
        config: workflowConfig,
      };

      const error = new Error('Resource not found');
      mockUpdate.mockRejectedValue(error);

      await expect(updateConfiguration(configToUpdate, context)).rejects.toThrow(error);
    });
  });
});
