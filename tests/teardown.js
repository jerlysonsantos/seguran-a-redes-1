const { run } = require('./lab');

// After all tests: removes any rule created by Jest that was left on the fw
module.exports = async () => {
  run('fw', `iptables -S | grep -- '--comment jest-' | sed 's/^-A/-D/' | while read -r r; do iptables $r; done`);
};
