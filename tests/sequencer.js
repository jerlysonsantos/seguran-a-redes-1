const Sequencer = require('@jest/test-sequencer').default;

// Roda os arquivos na ordem da atividade (01-, 02-, ...)
module.exports = class OrdemDaAtividade extends Sequencer {
  sort(testes) {
    return [...testes].sort((a, b) => a.path.localeCompare(b.path));
  }
};
