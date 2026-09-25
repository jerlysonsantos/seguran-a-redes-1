/**
 * API to build the lab scenarios in Jest using commands close to the terminal ones:
 *
 *   const eth0 = await fw.tcpdump('eth0', 'icmp');
 *   pc1.ping(INTERNET);
 *   fw.iptables('-I FORWARD 1 -i eth1 -o eth0 -p icmp -j DROP');
 *   expect(await eth0.stop()).toContainPacket('echo request');
 *
 * Set LAB_VERBOSE=1 to print every command executed on the machines and its output.
 * Set LAB_EVIDENCE=1 to save every tcpdump capture in evidencias/.
 */

const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const LAB = path.resolve(__dirname, '..');
const EVIDENCE_DIR = path.join(LAB, 'evidencias');

/** Internet destinations. Without Internet on the host: INTERNET=198.51.100.2 (r0) */
const INTERNET = process.env.INTERNET || '8.8.8.8';
const HTTP_INTERNET = process.env.HTTP_INTERNET || 'http://1.1.1.1';

/** Print every command and its output (LAB_VERBOSE=1) */
const VERBOSE = ['1', 'true'].includes(process.env.LAB_VERBOSE);

/** Save each tcpdump capture in evidencias/ (LAB_EVIDENCE=1) */
const EVIDENCE = ['1', 'true'].includes(process.env.LAB_EVIDENCE);

/** tcpdump packet line: starts with the time (e.g. 22:25:44.667697) */
const PACKET_LINE = /^\d{2}:\d{2}:\d{2}\.\d+ /;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * @typedef {object} CommandResult
 * @property {boolean} ok     true when the exit code is 0
 * @property {number}  code   exit code of the command
 * @property {string}  stdout
 * @property {string}  stderr
 */

let lastTestName = null;

/**
 * Prints a command and its result when LAB_VERBOSE=1.
 * @param {string} machine
 * @param {string} display  command as shown in the log
 * @param {string} [output] lines shown below the command
 */
function log(machine, display, output = '') {
  if (!VERBOSE) return;
  let text = '';
  const testName = typeof expect !== 'undefined' ? expect.getState().currentTestName : null;
  if (testName && testName !== lastTestName) {
    lastTestName = testName;
    text += `\n▶ ${testName}\n`;
  }
  text += `  [${machine}] $ ${display}\n`;
  const lines = output.trim();
  if (lines) text += `${lines.split('\n').map((l) => `      | ${l}`).join('\n')}\n`;
  process.stderr.write(text);
}

/**
 * Runs a command (bash -c) inside a lab machine.
 * @param {string} machine  machine name (pc1, fw, web...)
 * @param {string} command  shell command
 * @param {object} [options]
 * @param {string} [options.display] text shown in the verbose log instead of the command
 * @returns {CommandResult}
 */
function run(machine, command, { display = command } = {}) {
  const start = Date.now();
  const r = spawnSync('kathara', ['exec', '-d', LAB, machine, '--', 'bash', '-c', command], {
    encoding: 'utf8',
    timeout: 60000,
  });
  if (r.error) throw r.error;
  const result = {
    ok: r.status === 0,
    code: r.status,
    stdout: r.stdout.replace(/\r/g, ''),
    stderr: r.stderr.replace(/\r/g, ''),
  };
  log(machine, display, `${result.stdout}${result.stderr}\n(exit ${result.code}, ${Date.now() - start} ms)`);
  return result;
}

/** A lab machine. Methods run the equivalent terminal command inside it. */
class Machine {
  /** @param {string} name machine name in lab.conf */
  constructor(name) {
    this.name = name;
  }

  /**
   * Runs any shell command.
   * @param {string} command
   * @returns {CommandResult}
   */
  run(command, options) {
    return run(this.name, command, options);
  }

  /**
   * `ping -c 2 -W 2 <host>`. ok is true if any reply arrived.
   * @param {string} host
   * @returns {CommandResult}
   */
  ping(host) {
    return this.run(`ping -c 2 -W 2 ${host}`);
  }

  /**
   * `curl -s -m 4 <url>`.
   * @param {string} url
   * @returns {CommandResult & {body: string}} body is the response content
   */
  curl(url) {
    const r = this.run(`curl -s -m 4 ${url}`);
    return { ...r, body: r.stdout.trim() };
  }

  /**
   * Tries to open a TCP connection (bash /dev/tcp, 3s timeout).
   * @param {string} ip
   * @param {number} port
   * @returns {'OPEN'|'CLOSED'|'BLOCKED'} CLOSED: host answered with RST; BLOCKED: no answer (dropped)
   */
  tcp(ip, port) {
    const { code } = this.run(`timeout 3 bash -c 'echo > /dev/tcp/${ip}/${port}'`);
    if (code === 0) return 'OPEN';
    if (code === 124) return 'BLOCKED';
    return 'CLOSED';
  }

  /**
   * Sends a UDP datagram (bash /dev/udp) and waits up to 3s for one line of response.
   * @param {string} ip
   * @param {number} port
   * @param {string} [message]
   * @returns {{ok: boolean, response: string}}
   */
  udp(ip, port, message = 'ping') {
    const r = this.run(`exec 3<>/dev/udp/${ip}/${port}; echo '${message}' >&3; timeout 3 head -n1 <&3`);
    const response = r.stdout.trim();
    return { ok: response !== '', response };
  }

  /**
   * MAC address of an interface.
   * @param {string} [iface]
   * @returns {string} e.g. 'be:16:74:ee:52:8c'
   */
  mac(iface = 'eth0') {
    return this.run(`cat /sys/class/net/${iface}/address`).stdout.trim();
  }

  /**
   * `ip addr add <cidr> dev <iface>`. Ignores the error if the address already exists.
   * @param {string} cidr e.g. '10.0.2.12/24'
   * @param {string} [iface]
   */
  addIp(cidr, iface = 'eth0') {
    this.run(`ip addr add ${cidr} dev ${iface}`);
  }

  // Background servers keep their PID in a file so they can be restarted without pkill -f
  // (pkill -f would match its own bash -c, which contains the server command)

  /**
   * Starts (or restarts) a python HTTP server that answers with a fixed text.
   * @param {number} port
   * @param {string} text content of index.html
   */
  serveHttp(port, text) {
    const dir = `/tmp/http-${port}`;
    const r = this.run(
      `
      [ -f ${dir}.pid ] && kill $(cat ${dir}.pid) 2> /dev/null && sleep 0.3
      mkdir -p ${dir} && echo '${text}' > ${dir}/index.html
      (setsid nohup python3 -m http.server ${port} --directory ${dir} > /dev/null 2>&1 < /dev/null & echo $! > ${dir}.pid)
      for i in $(seq 25); do ss -ltn | grep -q ":${port} " && exit 0; sleep 0.2; done
      exit 1`,
      { display: `python3 -m http.server ${port} &   # serves "${text}"` },
    );
    if (!r.ok) throw new Error(`${this.name}: HTTP server on port ${port} did not start\n${r.stdout}${r.stderr}`);
  }

  /**
   * Starts (or restarts) a UDP server that answers PONG to every datagram.
   * @param {number} port
   */
  serveUdp(port) {
    const file = `/tmp/udp-${port}.py`;
    const r = this.run(
      `
      [ -f ${file}.pid ] && kill $(cat ${file}.pid) 2> /dev/null && sleep 0.3
      cat > ${file} << 'EOF'
import socket
s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
s.bind(('0.0.0.0', ${port}))
while True:
    d, a = s.recvfrom(1024)
    s.sendto(b'PONG\\n', a)
EOF
      (setsid nohup python3 ${file} > /dev/null 2>&1 < /dev/null & echo $! > ${file}.pid)
      for i in $(seq 25); do ss -lun | grep -q ":${port} " && exit 0; sleep 0.2; done
      exit 1`,
      { display: `python3 udp-echo.py ${port} &   # answers PONG` },
    );
    if (!r.ok) throw new Error(`${this.name}: UDP server on port ${port} did not start\n${r.stdout}${r.stderr}`);
  }
}

/**
 * @typedef {object} Rule
 * @property {string} id           unique comment added to the rule
 * @property {string} rule         rule as written in the test
 * @property {() => number} packets packets matched by the rule so far
 */

/**
 * @typedef {object} Capture
 * @property {() => Promise<string[]>} stop stops tcpdump and returns the captured packet lines
 */

/** The firewall: a Machine with helpers for iptables and tcpdump. */
class Firewall extends Machine {
  constructor() {
    super('fw');
    /** @type {string[]} ids of the rules created by this test file */
    this.created = [];
  }

  /**
   * Applies a rule written as in the terminal, without the "iptables" word:
   * `fw.iptables('-I FORWARD 1 -i eth1 -p icmp -j DROP')`.
   * A unique comment is added so the rule can be counted and undone.
   * @param {string} rule
   * @returns {Rule}
   */
  iptables(rule) {
    const parts = rule.trim().split(/\s+/);
    const position = parts[0] === '-I' && /^\d+$/.test(parts[2]) ? 3 : 2;
    const id = `jest-${Date.now().toString(36)}-${this.created.length}`;
    const command = [
      'iptables',
      ...parts.slice(0, position),
      '-m', 'comment', '--comment', id,
      ...parts.slice(position),
    ].join(' ');

    const r = this.run(command);
    if (!r.ok) throw new Error(`Invalid rule: ${command}\n${r.stdout}${r.stderr}`);
    this.created.push(id);
    return { id, rule, packets: () => this.counter(id) };
  }

  /**
   * Packets matched by the rule with the given id.
   * @param {string} id
   * @returns {number}
   */
  counter(id) {
    const r = this.run(`iptables -L -v -n -x | grep -F '/* ${id} */' | awk '{s += $1} END {print s + 0}'`);
    return Number(r.stdout.trim());
  }

  /**
   * Packets accepted by the stateful rule ESTABLISHED,RELATED in FORWARD.
   * @returns {number}
   */
  established() {
    const r = this.run(`iptables -L FORWARD -v -n -x | grep RELATED,ESTABLISHED | awk '{print $1}'`);
    return Number(r.stdout.trim());
  }

  /** `iptables -Z`: resets all counters. */
  resetCounters() {
    this.run('iptables -Z');
  }

  /**
   * Removes the rules created with fw.iptables().
   * @param {string} [id] a single rule; by default all rules created by this test file
   */
  undo(id = null) {
    const targets = id ? [id] : this.created;
    for (const target of targets) {
      this.run(`iptables -S | grep -- '--comment ${target}' | sed 's/^-A/-D/' | while read -r r; do iptables $r; done`);
    }
    this.created = id ? this.created.filter((c) => c !== id) : [];
  }

  /**
   * Starts tcpdump on a firewall interface. Start it before generating the traffic.
   * With LAB_EVIDENCE=1 the captured lines are also saved in evidencias/<test name> <iface>.txt.
   * @param {string} iface   e.g. 'eth1'
   * @param {string} [filter] tcpdump filter, e.g. 'icmp and host 10.0.1.10'
   * @param {string[]} [options] extra tcpdump options, e.g. ['-e'] to show MAC addresses
   * @returns {Promise<Capture>}
   */
  async tcpdump(iface, filter = '', options = []) {
    const tcpdumpArgs = ['-l', '-n', '-i', iface, ...options, ...(filter ? [filter] : [])];
    const display = `tcpdump ${tcpdumpArgs.join(' ')}`;
    log('fw', `${display} &`);

    const proc = spawn('kathara', ['exec', '-d', LAB, 'fw', '--', 'timeout', '60', 'tcpdump', ...tcpdumpArgs], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let output = '';
    let started;
    const ready = new Promise((resolve) => {
      const timer = setTimeout(resolve, 5000); // if the output is delayed, go on anyway
      started = () => {
        clearTimeout(timer);
        resolve();
      };
    });
    const read = (data) => {
      output += data;
      if (output.includes('listening on')) started();
    };
    proc.stdout.on('data', read);
    proc.stderr.on('data', read);
    const finished = new Promise((resolve) => proc.on('close', resolve));

    await ready;

    return {
      stop: async () => {
        await sleep(500);
        // [t]cpdump: keeps pkill from matching its own bash -c command
        run('fw', `pkill -f "[t]cpdump -l -n -i ${iface}"`, { display: `kill %${display}` });
        await finished;
        const lines = output.replace(/\r/g, '').split('\n').filter((l) => PACKET_LINE.test(l));
        log('fw', `${display}  → ${lines.length} packet(s)`, lines.join('\n'));
        if (EVIDENCE) saveEvidence(iface, filter, lines);
        return lines;
      },
    };
  }
}

/**
 * Saves the captured lines in evidencias/, named after the current test.
 * @param {string} iface
 * @param {string} filter
 * @param {string[]} lines
 */
function saveEvidence(iface, filter, lines) {
  const testName = (typeof expect !== 'undefined' && expect.getState().currentTestName) || 'capture';
  const fileName = `${testName} ${iface}`.replace(/[^\w.-]+/g, '_').slice(0, 150);
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  const text = `# ${testName}\n# tcpdump -i ${iface} ${filter}\n\n${lines.join('\n') || '(no packets)'}\n`;
  fs.writeFileSync(path.join(EVIDENCE_DIR, `${fileName}.txt`), text);
}

module.exports = {
  LAB,
  INTERNET,
  HTTP_INTERNET,
  run,
  pc1: new Machine('pc1'),
  pc2: new Machine('pc2'),
  web: new Machine('web'),
  dns: new Machine('dns'),
  adm: new Machine('adm'),
  r0: new Machine('r0'),
  fw: new Firewall(),
};
