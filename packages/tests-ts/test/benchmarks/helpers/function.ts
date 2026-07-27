import ms from 'ms';
import { setTimeout as sleep } from 'timers/promises';
import { BenchmarkResult } from '../types';
import { writeBenchmarkRecord } from './files';
import { calculateStats, printTestResult } from './testResults';

type BenchmarkRunOptions = {
  title: string;
  concurrentRuns?: number;
  comment?: string;
  context?: Record<string, unknown>;
};

type BenchmarkOptions = Omit<BenchmarkRunOptions, 'title'> & {
  runs?: number[];
  avoidColdStart?: boolean;
  runsDelay?: number;
};

export type BenchmarkedFunction = () => Promise<unknown>;

const now = new Date().toISOString();

export async function benchmarkFunction(fn: BenchmarkedFunction, title: string, options: BenchmarkOptions = {}) {
  const {
    runs = [500, 1_000, 5_000],
    runsDelay: runsDelaty = ms('2s'),
    concurrentRuns,
    avoidColdStart = true,
  } = options;

  // Call operation once to avoid cold start if needed
  if (avoidColdStart) await fn();

  let firstRun = true;
  for (const run of runs) {
    if (firstRun) firstRun = false;
    else await sleep(runsDelaty);

    let runTitle = String(run);
    if (run >= 1_000) runTitle = `${run / 1_000}K`;

    await benchmarkFunctionRun(fn, run, {
      ...options,
      title: `${title} - ${runTitle} calls, ${concurrentRuns ?? runTitle} concurrently`,
    });
  }
}

async function benchmarkFunctionRun(
  fn: BenchmarkedFunction,
  run: number,
  { title, concurrentRuns = run, comment, context = {} }: BenchmarkRunOptions,
) {
  const times = [];

  let remainingRuns = run;
  while (remainingRuns > 0) {
    const runs = Math.min(concurrentRuns, remainingRuns);

    const iterationTimes = await Promise.all(
      Array.from({ length: runs }, async () => {
        const startTime = performance.now();
        const setupTime = await fn();
        let timeTaken = performance.now() - startTime;

        if (Number.isFinite(setupTime)) timeTaken -= setupTime as number;

        return Number(timeTaken.toFixed(3));
      }),
    );

    times.push(...iterationTimes);
    remainingRuns -= runs;
  }

  // Calculate and save stats
  const stats = calculateStats(times);

  const result: BenchmarkResult = {
    id: title,
    timestamp: now,
    results: stats,
    context: { ...context, totalRuns: run, concurrentRuns },
    comment: [comment, `Average time: ${ms(stats.average, { long: true })}`].filter((str) => str).join('. '),
  };

  writeBenchmarkRecord(result);
  printTestResult(result);
}
