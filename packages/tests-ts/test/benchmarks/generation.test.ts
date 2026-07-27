import { GetGenerationCommand, ListGenerationsCommand } from '@awssolutions/gen-ai-evaluation-toolkit-ts-client';
import { send, startDummyGenerationRun } from '../helpers';
import { benchmarkFunction } from './helpers';

describe('Generation endpoints benchmark', () => {
  test('Get generation', async () => {
    await using job = await startDummyGenerationRun();
    const { id: jobId } = job;

    await benchmarkFunction(() => send(new GetGenerationCommand({ id: jobId })), 'Get Generation Command', {
      runs: [250],
    });
  });

  test('List generations', async () => {
    await benchmarkFunction(() => send(new ListGenerationsCommand()), 'List Generations', {
      runs: [150],
    });
  });
});
