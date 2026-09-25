const { pc1, pc2, web, fw, INTERNET } = require("./lab");

describe("Etapa 1 - Baseline: conectividade e encaminhamento", () => {
  beforeAll(() => web.serveHttp(80, "WEB DMZ"));

  test("LAN -> Internet (pc1 e pc2)", () => {
    expect(pc1.ping(INTERNET).ok).toBe(true);
    expect(pc2.ping(INTERNET).ok).toBe(true);
  });

  test("LAN -> Web da DMZ", () => {
    expect(pc1.curl("http://10.0.2.10").body).toBe("WEB DMZ");
  });

  test("LAN -> DNS da DMZ (porta 53 alcancavel)", () => {
    expect(pc1.tcp("10.0.2.11", 53)).not.toBe("BLOCKED");
  });

  test("fw recebe o ping na LAN (eth1) e encaminha para a WAN (eth0)", async () => {
    const eth1 = await fw.tcpdump("eth1", `icmp and host ${INTERNET}`);
    const eth0 = await fw.tcpdump("eth0", `icmp and host ${INTERNET}`);

    pc1.ping(INTERNET);

    expect(await eth1.stop()).toContainPacket(
      `10.0.1.10 > ${INTERNET}`,
      "echo request",
    );
    const wan = await eth0.stop();
    expect(wan).toContainPacket(`10.0.1.10 > ${INTERNET}`, "echo request");
    expect(wan).toContainPacket(`${INTERNET} > 10.0.1.10`, "echo reply");
  });
});
