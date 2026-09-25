module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/**/*.test.js'],
  // Todos os testes mexem no mesmo firewall: um arquivo por vez
  maxWorkers: 1,
  // Pings bloqueados levam alguns segundos ate desistir
  testTimeout: 120000,
  verbose: true,
  setupFilesAfterEnv: ['<rootDir>/tests/matchers.js'],
  globalTeardown: '<rootDir>/tests/teardown.js',
  testSequencer: '<rootDir>/tests/sequencer.js',
};
