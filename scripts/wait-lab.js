const { run } = require("../tests/lab");

const CHECKS = {
  pc1: ["ip route", "default via 10.0.1.1"],
  pc2: ["ip route", "default via 10.0.1.1"],
  web: ["ip route", "default via 10.0.2.1"],
  dns: ["ip route", "default via 10.0.2.1"],
  adm: ["ip route", "default via 10.0.3.1"],
  r0: ["iptables -t nat -S POSTROUTING", "MASQUERADE"],
  fw: ["iptables -S FORWARD", "-i eth0 -o eth2"],
};

const TIMEOUT_MS = 180000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const start = Date.now();
  const pending = new Set(Object.keys(CHECKS));

  while (pending.size > 0) {
    for (const machine of [...pending]) {
      const [command, expected] = CHECKS[machine];
      try {
        if (run(machine, command).stdout.includes(expected)) {
          pending.delete(machine);
          console.log(`${machine} pronta`);
        }
      } catch {}
    }
    if (pending.size === 0) break;
    if (Date.now() - start > TIMEOUT_MS) {
      console.error(`Tempo esgotado aguardando: ${[...pending].join(", ")}`);
      process.exit(1);
    }
    await sleep(2000);
  }
  console.log("Lab pronto");
}

main();
