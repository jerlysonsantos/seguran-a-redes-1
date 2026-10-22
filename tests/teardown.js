const { run } = require('./lab');

module.exports = async () => {
  for (const machine of ['fw', 'proxy']) {
    run(machine, `iptables -S | grep -- '--comment jest-' | sed 's/^-A/-D/' | while read -r r; do iptables $r; done`);
  }
};
