import {
  GetGenerationCommand,
  ListGenerationsCommand,
  StepFunctionJobStatus,
  StopGenerationCommand,
} from '@awssolutions/gen-ai-evaluation-toolkit-ts-client';
import { send, startDummyGenerationRun } from '../helpers';
import { randomUUID } from 'crypto';

describe('Generation Tests', () => {
  describe('Generation', () => {
    test('Get generation run', async () => {
      await using run = await startDummyGenerationRun();

      const retrievedGeneration = await send(new GetGenerationCommand({ id: run.id }));

      expect(retrievedGeneration.id).toEqual(run.id);
    });

    test('Stop generation run', async () => {
      const longRunningJobConfig = {
        name: `test-generation-${randomUUID()}`,
        experimentName: undefined,
        steps: Array(10).fill({
          plugin: 'generationNoopPlugin',
          configuration: {},
        }),
      };
      await using run = await startDummyGenerationRun(longRunningJobConfig);

      expect(run.id).toBeDefined();

      let retrievedGeneration = await send(new GetGenerationCommand({ id: run.id }));

      expect(retrievedGeneration.id).toEqual(run.id);
      expect(retrievedGeneration.status).toEqual(StepFunctionJobStatus.RUNNING);

      const stopReason = { cause: 'TestStop', error: 'InterruptError' };

      retrievedGeneration = await send(new StopGenerationCommand({ id: run.id, ...stopReason }));

      expect(retrievedGeneration.id).toEqual(run.id);
      expect(retrievedGeneration.status).toEqual(StepFunctionJobStatus.ABORTED);
      expect(retrievedGeneration.cause).toEqual(stopReason.cause);
      expect(retrievedGeneration.error).toEqual(stopReason.error);

      retrievedGeneration = await send(new GetGenerationCommand({ id: run.id }));

      expect(retrievedGeneration.id).toEqual(run.id);
      expect(retrievedGeneration.status).toEqual(StepFunctionJobStatus.ABORTED);
      expect(retrievedGeneration.cause).toEqual(stopReason.cause);
      expect(retrievedGeneration.error).toEqual(stopReason.error);
    });

    test('List generation runs', async () => {
      await using run1 = await startDummyGenerationRun();
      await using run2 = await startDummyGenerationRun();
      await using run3 = await startDummyGenerationRun();
      const ids = new Set([run1.id, run2.id, run3.id]);

      let retrievedGenerations = await send(new ListGenerationsCommand({}));

      expect(retrievedGenerations.jobs.length).toBeGreaterThanOrEqual(3);

      while (ids.size) {
        retrievedGenerations.jobs.forEach((job) => {
          if (ids.has(job.id)) ids.delete(job.id);
        });

        if (!retrievedGenerations.nextToken) break;
        retrievedGenerations = await send(new ListGenerationsCommand({ nextToken: retrievedGenerations.nextToken }));
      }

      expect(ids.size).toBe(0);
    });
  });
});
