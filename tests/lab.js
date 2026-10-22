const { spawn, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const LAB = path.resolve(__dirname, "..");
const EVIDENCE_DIR = path.join(LAB, "evidencias");

const INTERNET = process.env.INTERNET || "8.8.8.8";
const HTTP_INTERNET = process.env.HTTP_INTERNET || "http://1.1.1.1";
const HTTPS_INTERNET = process.env.HTTPS_INTERNET || "https://1.1.1.1";
const SITE = process.env.SITE || "https://pudim.com.br";
const CACHE_SITE = process.env.CACHE_SITE || "http://example.com";

const VERBOSE = ["1", "true"].includes(process.env.LAB_VERBOSE);

const EVIDENCE = ["1", "true"].includes(process.env.LAB_EVIDENCE);

const PACKET_LINE = /^\d{2}:\d{2}:\d{2}\.\d+ /;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let lastTestName = null;

function log(machine, display, output = "") {
  if (!VERBOSE) return;
  let text = "";
  const testName =
    typeof expect !== "undefined" ? expect.getState().currentTestName : null;
  if (testName && testName !== lastTestName) {
    lastTestName = testName;
    text += `\n▶ ${testName}\n`;
  }
  text += `  [${machine}] $ ${display}\n`;
  const lines = output.trim();
  if (lines)
    text += `${lines
      .split("\n")
      .map((l) => `      | ${l}`)
      .join("\n")}\n`;
  process.stderr.write(text);
}

function run(machine, command, { display = command } = {}) {
  const start = Date.now();
  const r = spawnSync(
    "kathara",
    ["exec", "-d", LAB, machine, "--", "bash", "-c", command],
    {
      encoding: "utf8",
      timeout: 60000,
    },
  );
  if (r.error) throw r.error;
  const result = {
    ok: r.status === 0,
    code: r.status,
    stdout: r.stdout.replace(/\r/g, ""),
    stderr: r.stderr.replace(/\r/g, ""),
  };
  log(
    machine,
    display,
    `${result.stdout}${result.stderr}\n(exit ${result.code}, ${Date.now() - start} ms)`,
  );
  return result;
}

class Machine {
  constructor(name) {
    this.name = name;
  }

  run(command, options) {
    return run(this.name, command, options);
  }

  ping(host) {
    return this.run(`ping -c 2 -W 2 ${host}`);
  }

  curl(url, { proxy, insecure = false, timeout = 4 } = {}) {
    const flags = [
      `-s -m ${timeout}`,
      proxy ? `-x ${proxy}` : "",
      insecure ? "-k" : "",
    ].filter(Boolean);
    const r = this.run(`curl ${flags.join(" ")} ${url}`);
    return { ...r, body: r.stdout.trim() };
  }

  tcp(ip, port) {
    const { code } = this.run(
      `timeout 3 bash -c 'echo > /dev/tcp/${ip}/${port}'`,
    );
    if (code === 0) return "OPEN";
    if (code === 124) return "BLOCKED";
    return "CLOSED";
  }

  udp(ip, port, message = "ping") {
    const r = this.run(
      `exec 3<>/dev/udp/${ip}/${port}; echo '${message}' >&3; timeout 3 head -n1 <&3`,
    );
    const response = r.stdout.trim();
    return { ok: response !== "", response };
  }

  mac(iface = "eth0") {
    return this.run(`cat /sys/class/net/${iface}/address`).stdout.trim();
  }

  addIp(cidr, iface = "eth0") {
    this.run(`ip addr add ${cidr} dev ${iface}`);
  }

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
    if (!r.ok)
      throw new Error(
        `${this.name}: HTTP server on port ${port} did not start\n${r.stdout}${r.stderr}`,
      );
  }

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
    if (!r.ok)
      throw new Error(
        `${this.name}: UDP server on port ${port} did not start\n${r.stdout}${r.stderr}`,
      );
  }
}

class Firewall extends Machine {
  constructor(name = "fw") {
    super(name);
    this.created = [];
  }

  iptables(rule) {
    const parts = rule.trim().split(/\s+/);
    const position = parts[0] === "-I" && /^\d+$/.test(parts[2]) ? 3 : 2;
    const id = `jest-${Date.now().toString(36)}-${this.created.length}`;
    const command = [
      "iptables",
      ...parts.slice(0, position),
      "-m",
      "comment",
      "--comment",
      id,
      ...parts.slice(position),
    ].join(" ");

    const r = this.run(command);
    if (!r.ok)
      throw new Error(`Invalid rule: ${command}\n${r.stdout}${r.stderr}`);
    this.created.push(id);
    return { id, rule, packets: () => this.counter(id) };
  }

  counter(id) {
    const r = this.run(
      `iptables -L -v -n -x | grep -F '/* ${id} */' | awk '{s += $1} END {print s + 0}'`,
    );
    return Number(r.stdout.trim());
  }

  established() {
    const r = this.run(
      `iptables -L FORWARD -v -n -x | grep RELATED,ESTABLISHED | awk '{print $1}'`,
    );
    return Number(r.stdout.trim());
  }

  resetCounters() {
    this.run("iptables -Z");
  }

  undo(id = null) {
    const targets = id ? [id] : this.created;
    for (const target of targets) {
      this.run(
        `iptables -S | grep -- '--comment ${target}' | sed 's/^-A/-D/' | while read -r r; do iptables $r; done`,
      );
    }
    this.created = id ? this.created.filter((c) => c !== id) : [];
  }

  async tcpdump(iface, filter = "", options = []) {
    const tcpdumpArgs = [
      "-l",
      "-n",
      "-i",
      iface,
      ...options,
      ...(filter ? [filter] : []),
    ];
    const display = `tcpdump ${tcpdumpArgs.join(" ")}`;
    log(this.name, `${display} &`);

    const proc = spawn(
      "kathara",
      [
        "exec",
        "-d",
        LAB,
        this.name,
        "--",
        "timeout",
        "60",
        "tcpdump",
        ...tcpdumpArgs,
      ],
      {
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    let output = "";
    let started;
    const ready = new Promise((resolve) => {
      const timer = setTimeout(resolve, 5000);
      started = () => {
        clearTimeout(timer);
        resolve();
      };
    });
    const read = (data) => {
      output += data;
      if (output.includes("listening on")) started();
    };
    proc.stdout.on("data", read);
    proc.stderr.on("data", read);
    const finished = new Promise((resolve) => proc.on("close", resolve));

    await ready;

    return {
      stop: async () => {
        await sleep(500);
        run(this.name, `pkill -f "[t]cpdump -l -n -i ${iface}"`, {
          display: `kill %${display}`,
        });
        await finished;
        const lines = output
          .replace(/\r/g, "")
          .split("\n")
          .filter((l) => PACKET_LINE.test(l));
        log(
          this.name,
          `${display}  → ${lines.length} packet(s)`,
          lines.join("\n"),
        );
        if (EVIDENCE) saveEvidence(iface, filter, lines);
        return lines;
      },
    };
  }
}

function saveEvidence(iface, filter, lines) {
  const testName =
    (typeof expect !== "undefined" && expect.getState().currentTestName) ||
    "capture";
  const fileName = `${testName} ${iface}`
    .replace(/[^\w.-]+/g, "_")
    .slice(0, 150);
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  const text = `# ${testName}\n# tcpdump -i ${iface} ${filter}\n\n${lines.join("\n") || "(no packets)"}\n`;
  fs.writeFileSync(path.join(EVIDENCE_DIR, `${fileName}.txt`), text);
}

module.exports = {
  LAB,
  INTERNET,
  HTTP_INTERNET,
  HTTPS_INTERNET,
  SITE,
  CACHE_SITE,
  run,
  pc1: new Machine("pc1"),
  pc2: new Machine("pc2"),
  web: new Machine("web"),
  rp: new Machine("rp"),
  dns: new Machine("dns"),
  adm: new Machine("adm"),
  r0: new Machine("r0"),
  fw: new Firewall("fw"),
  proxy: new Firewall("proxy"),
};
