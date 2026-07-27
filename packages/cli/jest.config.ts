import type { Config } from 'jest';
import { pathsToModuleNameMapper } from 'ts-jest';
import { readFileSync } from 'fs';

const tsconfig = JSON.parse(readFileSync('./tsconfig.json', 'utf8'));

const config: Config = {
  displayName: '@awssolutions/gen-ai-evaluation-toolkit-cli',
  collectCoverage: true,
  preset: 'ts-jest',
  testEnvironment: 'node',
  testRegex: '.*\\.test\\.ts$',
  moduleFileExtensions: ['ts', 'js'],

  coverageDirectory: '<rootDir>/build/documentation/coverage',
  coverageReporters: ['text-summary', 'text', 'cobertura', 'lcov', 'json'],

  moduleDirectories: ['node_modules', '<rootDir>'],
  moduleNameMapper: pathsToModuleNameMapper(tsconfig.compilerOptions.paths, {
    prefix: '<rootDir>/',
  }),

  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/build/', '/coverage/'],
  coveragePathIgnorePatterns: ['/node_modules/', '/dist/', '/build/', '/coverage/'],
};

export default config;
