import * as fs from 'fs';
import * as path from 'path';
import { lazy } from '../../helpers';
import { BenchmarkId, BenchmarkResult } from '../types';
import assert from 'assert';

const benchmarksDiretory = lazy(() => {
  const benchmarksPath = path.join(getProjectRoot(), '.benchmark');
  fs.mkdirSync(benchmarksPath, { recursive: true });
  return benchmarksPath;
});

const benchmarkRecordsPath = lazy(() => {
  return path.join(benchmarksDiretory(), 'results.json');
});

type BenchmarkRecords = Record<string, BenchmarkResult>;

export function readBenchmarkResult(id: BenchmarkId): BenchmarkResult {
  const records = readBenchmarkRecords();

  const result = records[id];
  assert(result != null);

  return result;
}

export function writeBenchmarkRecord(result: BenchmarkResult) {
  const records = readBenchmarkRecords();
  records[result.id] = result;

  writeBenchmarkRecords(records);
}

function readBenchmarkRecords(): BenchmarkRecords {
  let records = {};

  try {
    const saved = fs.readFileSync(benchmarkRecordsPath(), 'utf-8');
    records = JSON.parse(saved);
  } catch (err) {
    console.warn('Could not read saved benchmark records, assuming an empty object...', err);
  }

  return records;
}

function writeBenchmarkRecords(records: Record<string, BenchmarkResult>) {
  fs.writeFileSync(benchmarkRecordsPath(), JSON.stringify(records, null, 2));
}

function getProjectRoot() {
  let currentDir = __dirname;

  while (currentDir != '/') {
    const rootFiles = ['.git', 'package.json'];
    for (const file of rootFiles) {
      const filePath = path.join(currentDir, file);
      if (fs.existsSync(filePath)) return currentDir;
    }

    currentDir = path.dirname(currentDir);
  }

  throw new Error('Could not locate project root');
}
