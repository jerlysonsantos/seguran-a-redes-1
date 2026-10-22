const Sequencer = require('@jest/test-sequencer').default;

module.exports = class OrdemDaAtividade extends Sequencer {
  sort(testes) {
    return [...testes].sort((a, b) => a.path.localeCompare(b.path));
  }
};
