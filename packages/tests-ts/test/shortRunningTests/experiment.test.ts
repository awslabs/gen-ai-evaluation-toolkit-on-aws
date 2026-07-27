import {
  CreateConfigurationCommand,
  CreateExperimentCommand,
  GenAiEvaluationToolkitServiceException,
  GetConfigurationCommand,
  ListExperimentOutputsCommand,
  ResourceNotFoundException,
  UpdateConfigurationCommand,
  ValidationException,
} from '@awssolutions/gen-ai-evaluation-toolkit-ts-client';
import { getDummyTestData, send } from '../helpers';
import { createExperiment } from '../helpers/experiment';

describe('Experiment Tests', () => {
  describe('Experiment', () => {
    test('Experiment creation', async () => {
      await createExperiment();
    });
  });

});

describe('Experiment', () => {
  describe('Proper error handling', () => {

    test('CreateExperimentCommand for empty input', async () => {
      try {
        // @ts-expect-error force passing empty input
        await send(new CreateExperimentCommand({}));
        throw new Error('Expected exception was not thrown');
      } catch (error) {
        const castError = error as GenAiEvaluationToolkitServiceException & { error: string };
        expect(castError.error).toBe('ValidationException');
      }
    });

    test('CreateExperimentCommand for experiment that already exists', async () => {
      const createExperiment = () => send(new CreateExperimentCommand({ name: 'duplicateExperimentTest' }));

      // Make sure experiment is created, no problem if it fails
      await createExperiment().catch(() => {});

      try {
        await createExperiment();
        throw new Error('Expected exception was not thrown');
      } catch (error) {
        const castError = error as GenAiEvaluationToolkitServiceException & { error: string };
        expect(castError.error).toBe('ConflictException');
        expect(castError.message).toContain('already exists');
      }
    });

    test('ListExperimentOutputsCommand for empty input', async () => {
      const commands = [ListExperimentOutputsCommand];

      for (const Command of commands) {
        // @ts-expect-error force passing empty input
        await expect(send(new Command({}))).rejects.toThrow(/No value provided for input HTTP label:/);
      }
    });

    test('GetConfigurationCommand for non-existing config', async () => {
      await expect(send(new GetConfigurationCommand({ name: 'NonExistingConfig' }))).rejects.toThrow(
        ResourceNotFoundException,
      );
    });

    test('UpdateExperimentConfigurationCommand and UpdateConfigurationCommand for non-existing config', async () => {
      // Get dummy test data for the configuration
      const dummyTestData = await getDummyTestData();

      // Test UpdateConfigurationCommand
      await expect(
        send(
          new UpdateConfigurationCommand({
            configuration: {
              name: 'NonExistingConfig',
              config: {
                evaluationConfiguration: {
                  testData: dummyTestData,
                  plugins: [{ plugin: 'evalNoopPlugin', configuration: {} }],
                },
              },
            },
          }),
        ),
      ).rejects.toThrow(ResourceNotFoundException);
    });

    test('ListExperimentOutputsCommand for non-existing experiment', async () => {
      try {
        await send(new ListExperimentOutputsCommand({ name: 'NonExistingExperiment', startVersion: 1, endVersion: 1 }));
      } catch (error) {
        const castError = error as GenAiEvaluationToolkitServiceException & { error: string };
        expect(castError.error).toBe('ResourceNotFoundException');
        expect(castError.message).toContain("Experiment with name 'NonExistingExperiment' not found");
      }
    });

    test('Missing configuration name', async () => {
      const commands = [
        CreateConfigurationCommand,
        UpdateConfigurationCommand,
      ];

      for (const Command of commands) {
        // @ts-expect-error force passing empty input
        await expect(send(new Command({ configuration: {} }))).rejects.toThrow(ValidationException);
      }
    });
  });
});
