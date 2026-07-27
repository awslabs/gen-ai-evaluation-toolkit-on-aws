// Tests can exhaust system memory so make it easy for folks to avoid this
// N.B. That maxWorkers set to 1 is the same as setting --runInBand using the CLI, but there's no way to do the latter in config:
// https://github.com/jestjs/jest/issues/3215
let maxWorkers = process.env.JEST_MAX_WORKERS || 1;

// In CI, run tests in full capacity
// Set maxWorkers for CI environments
if (process.env.CI) maxWorkers = '50%';

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.test.ts', '**/*.tests.ts'],
  transform: { '^.+\\.tsx?$': 'ts-jest' },
  setupFilesAfterEnv: ['<rootDir>/test/setup/after-env.ts'],
  maxWorkers,
};
