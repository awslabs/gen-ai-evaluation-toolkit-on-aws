/* eslint-disable */
module.exports = {
  verbose: true,
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
  },

  // Add the setup file to be executed before tests
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],

  // Set timeout to 90 seconds. Adding this here helps when running tests locally
  testTimeout: 90_000,

  // Leave the max Jest workers as the default value (https://jestjs.io/docs/cli#--maxworkersnumstring)
  // E2E tests are mostly polling and don't cause out of memory issues unlike our unit tests
};
