import { readFileSync } from 'fs';
import type { Config } from 'jest';
import { pathsToModuleNameMapper } from 'ts-jest';

const tsconfig = JSON.parse(readFileSync('./tsconfig.json', 'utf8'));

// Setting higher value for space size environment variable to avoid out of memory issues.
if (!process.env.NODE_OPTIONS) {
  process.env.NODE_OPTIONS = '--max-old-space-size=8192';
}

// Tests can exhaust system memory so make it easy for folks to avoid this
// N.B. That maxWorkers set to 1 is the same as setting --runInBand using the CLI, but there's no way to do the latter in config:
// https://github.com/jestjs/jest/issues/3215
let maxWorkers = process.env.JEST_MAX_WORKERS || 1;

// In CI, run tests in higher capacity
// Set maxWorkers for CI environments
if (process.env.CI) maxWorkers = '50%';

const config: Config = {
  collectCoverage: true,
  preset: 'ts-jest',
  testEnvironment: 'node',
  testRegex: '.*\\.test\\.ts$',
  moduleFileExtensions: ['ts', 'js'],
  coverageDirectory: '<rootDir>/build/documentation/coverage',
  coverageReporters: ['text-summary', 'text', 'cobertura', 'lcov', 'json'],

  moduleNameMapper: pathsToModuleNameMapper(tsconfig.compilerOptions.paths, {
    prefix: '<rootDir>/',
  }),
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/build/', '/coverage/', '/.coverage/'],
  coveragePathIgnorePatterns: ['/node_modules/', '/dist/', '/build/', '/coverage/', '/.coverage/'],

  maxWorkers,
};

export default config;
