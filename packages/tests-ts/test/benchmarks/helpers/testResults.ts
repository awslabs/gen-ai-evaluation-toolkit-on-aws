import { inspect } from 'util';
import ms from 'ms';
import { BenchmarkResult } from '../types';

/**
 * Given an array of numbers, gets nth percentile. Used to calculate p50, p90, p99, etc...
 *
 * Implementation reference: https://en.wikipedia.org/wiki/Percentile#The_nearest-rank_method
 */
export function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[index];
}

/**
 * Rounds given number to `precision` digits after the decimal point.
 */
export function roundNumber(value: number, precision = 3): number {
  return Number(value.toFixed(precision));
}

export function calculateStats(times: number[], base = 0): BenchmarkResult['results'] {
  times = times.map((t) => t - base);

  return {
    min: Math.min(...times),
    max: Math.max(...times),
    average: roundNumber(times.reduce((a, b) => a + b) / times.length),
    median: percentile(times, 50),
    p90: percentile(times, 90),
    p99: percentile(times, 99),
  };
}

/**
 * Prints test results in a human-readable format
 */
export function printTestResult(result: BenchmarkResult) {
  const mappedResults = Object.fromEntries(Object.entries(result.results).map(([k, v]) => [k, ms(v)]));
  console.log(inspect({ ...result, results: mappedResults }, { depth: null, colors: true }));
}
