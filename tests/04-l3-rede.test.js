const { pc1, pc2, web, fw, INTERNET, HTTP_INTERNET } = require('./lab');

describe('L3 - Rede (A): bloqueio de ICMP LAN -> Internet', () => {
  afterAll(() => fw.undo());

  test('antes: ping passa pelo fw', async () => {
    const eth0 = await fw.tcpdump('eth0', 'icmp and host 10.0.1.10');

    expect(pc1.ping(INTERNET).ok).toBe(true);

    const wan = await eth0.stop();
    expect(wan).toContainPacket('echo request');
    expect(wan).toContainPacket('echo reply');
  });

  test('depois: ping para no fw, HTTP continua', async () => {
    const rule = fw.iptables('-I FORWARD 1 -i eth1 -o eth0 -p icmp -j DROP');

    const eth1 = await fw.tcpdump('eth1', 'icmp and host 10.0.1.10');
    const eth0 = await fw.tcpdump('eth0', 'icmp and host 10.0.1.10');

    expect(pc1.ping(INTERNET).ok).toBe(false);
    expect(pc1.curl(HTTP_INTERNET).ok).toBe(true);

    const lan = await eth1.stop();
    expect(lan).toContainPacket('echo request');
    expect(lan).not.toContainPacket('echo reply');
    expect(await eth0.stop()).toHaveLength(0);
    expect(rule.packets()).toBeGreaterThan(0);
  });
});

describe('L3 - Rede (B): bloqueio do destino 10.0.2.10 (site proibido)', () => {
  const syn80 = 'tcp port 80 and tcp[tcpflags] & tcp-syn != 0';

  beforeAll(() => {
    // O mesmo site responde por dois IPs
    web.addIp('10.0.2.12/24');
    web.serveHttp(80, 'SITE PROIBIDO');
    // O segundo IP fica liberado, como se estivesse na Internet
    fw.iptables('-A FORWARD -i eth1 -o eth2 -d 10.0.2.12 -p tcp --dport 80 -j ACCEPT');
  });

  afterAll(() => fw.undo());

  test('antes: pc1 e pc2 acessam o site pelos dois IPs', () => {
    for (const pc of [pc1, pc2]) {
      expect(pc.curl('http://10.0.2.10').body).toBe('SITE PROIBIDO');
      expect(pc.curl('http://10.0.2.12').body).toBe('SITE PROIBIDO');
    }
  });

  test('depois: toda a LAN perde o acesso ao IP 10.0.2.10', async () => {
    const rule = fw.iptables('-I FORWARD 1 -i eth1 -d 10.0.2.10 -j DROP');

    const eth1 = await fw.tcpdump('eth1', syn80);
    const eth2 = await fw.tcpdump('eth2', syn80);

    expect(pc1.curl('http://10.0.2.10').ok).toBe(false);
    expect(pc2.curl('http://10.0.2.10').ok).toBe(false);

    expect(await eth1.stop()).toContainPacket('> 10.0.2.10.80:');
    expect(await eth2.stop()).not.toContainPacket('> 10.0.2.10.80:');
    expect(rule.packets()).toBeGreaterThan(0);
  });

  test('limitacao: o mesmo site continua acessivel pelo outro IP', async () => {
    const eth2 = await fw.tcpdump('eth2', syn80);

    expect(pc1.curl('http://10.0.2.12').body).toBe('SITE PROIBIDO');
    expect(pc2.curl('http://10.0.2.12').body).toBe('SITE PROIBIDO');

    expect(await eth2.stop()).toContainPacket('> 10.0.2.12.80:');
  });
});
