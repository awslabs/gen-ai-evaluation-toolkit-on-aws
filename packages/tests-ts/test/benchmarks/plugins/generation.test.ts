import {
  GenerationStep,
  GetGenerationCommand,
  StartGenerationInput,
  StepFunctionJobStatus,
} from '@awssolutions/gen-ai-evaluation-toolkit-ts-client';
import ms from 'ms';
import {
  createDummyDataset,
  getDummyRagDocuments,
  send,
  startDummyGenerationRun,
  waitUntilGenerationRunIsCompleted,
} from '../../helpers';
import { calculateStats, printTestResult, readBenchmarkResult, writeBenchmarkRecord } from '../helpers';
import { BenchmarkId, BenchmarkResult } from '../types';

const now = new Date();

describe('Generation Performance Tests', () => {
  jest.setTimeout(ms('30 minutes'));

  /*
   * FIXME: Benchmarks are not stable and sometimes are not even consistent.
   * - Bedrock delay before the task actually starts is undefined and can vary largly from run to run
   * - Subtracting one run's time from another run's time to measure the difference can give inconsistent results, and even negative numbers.
   *
   * Maybe we can watch and measure the exact runtime of bedrock once the task starts instead of measure the whole time start-to-end
   * And also the same thing for ECS time, sometimes it contains unknown delays, and there is no guarantees about how long it would take to start
   * but ECS time usually varies by a few minutes, while bedrock's time can vary by hours.
   */

  beforeAll(async () => {
    // Run a single execution to avoid benchmarking cold-starts
    await runGenerationWorkflow();
  });

  test('Empty workflow', async () => {
    await benchmarkWorkflow({
      id: BenchmarkId.EmptyWorkFlow,
      steps: [],
      runsCount: 10,
      sleepMs: 100,
    });
  });

  describe('Plugins', () => {
    test('Generation plugin', async () => {
      const steps: GenerationStep[] = [
        {
          plugin: 'generateTestCases',
          configuration: {
            documentSource: await getDummyRagDocuments(),
          },
        },
      ];

      const emptyWorkflowResult = readBenchmarkResult(BenchmarkId.EmptyWorkFlow);

      await benchmarkWorkflow({
        id: BenchmarkId.GenerationPlugin,
        steps,
        base: emptyWorkflowResult.results.average,
      });
    });

    test('LLM as Judge Plugin', async () => {
      const steps: GenerationStep[] = [
        {
          plugin: 'generateTestCases',
          configuration: {
            documentSource: await getDummyRagDocuments(),
          },
        },
        {
          plugin: 'llmAsJudge',
          configuration: {},
        },
      ];

      const emptyWorkflowResult = readBenchmarkResult(BenchmarkId.EmptyWorkFlow);
      const generationResult = readBenchmarkResult(BenchmarkId.GenerationPlugin);

      await benchmarkWorkflow({
        id: BenchmarkId.LlmAsJudgePlugin,
        steps,
        base: emptyWorkflowResult.results.average + generationResult.results.average,
      });
    });

    test('Export Plugin', async () => {
      await using dataset = await createDummyDataset();

      const steps: GenerationStep[] = [
        {
          plugin: 'generateTestCases',
          configuration: {
            documentSource: await getDummyRagDocuments(),
          },
        },
        {
          plugin: 'DatastoreExport',
          configuration: {
            datasetConfiguration: {
              dataset: dataset.datasetId,
            },
          },
        },
      ];

      const emptyWorkflowResult = readBenchmarkResult(BenchmarkId.EmptyWorkFlow);
      const generationResult = readBenchmarkResult(BenchmarkId.GenerationPlugin);

      await benchmarkWorkflow({
        id: BenchmarkId.ExportPlugin,
        steps,
        base: emptyWorkflowResult.results.average + generationResult.results.average,
      });
    });
  });
});

async function benchmarkWorkflow(options: {
  steps: GenerationStep[];
  id: BenchmarkId;
  sleepMs?: number;
  runsCount?: number;
  base?: number;
}) {
  const { steps, id, runsCount = 5, base = 0, sleepMs } = options;

  const results = await Promise.all(Array.from({ length: runsCount }, () => runGenerationWorkflow(steps, { sleepMs })));
  const times = results.map((res) => res.timeTaken);
  const result: BenchmarkResult = {
    id,
    timestamp: now.toISOString(),
    results: calculateStats(times, base),
  };

  writeBenchmarkRecord(result);
  printTestResult(result);
}

async function runGenerationWorkflow(steps: GenerationStep[] = [], { sleepMs = 250 } = {}) {
  const generationJob: StartGenerationInput = { steps };

  // Start the generation run
  const startTime = performance.now();
  await using run = await startDummyGenerationRun(generationJob);

  // Wait for completion
  await waitUntilGenerationRunIsCompleted(run.id, { sleepMs });
  const timeTaken = Number((performance.now() - startTime).toFixed(3));

  // Verify completion
  const completedGenerationJob = await send(new GetGenerationCommand({ id: run.id }));
  expect(completedGenerationJob.status).toEqual(StepFunctionJobStatus.SUCCEEDED);

  return { timeTaken };
}
