module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/**/*.test.js'],
  maxWorkers: 1,
  testTimeout: 120000,
  verbose: true,
  setupFilesAfterEnv: ['<rootDir>/tests/matchers.js'],
  globalTeardown: '<rootDir>/tests/teardown.js',
  testSequencer: '<rootDir>/tests/sequencer.js',
};
