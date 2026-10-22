const { pc1, pc2, rp, fw, proxy, INTERNET, HTTPS_INTERNET } = require('./lab');

// Os PCs nao fazem ping para fora (o proxy nao libera ICMP).
// Quem gera o ICMP da LAN aqui e o proprio proxy, que esta no segmento LAN do fw.
describe('L3 - Rede (A): bloqueio de ICMP LAN -> Internet', () => {
  const icmp = 'icmp and host 10.0.1.20';

  afterAll(() => fw.undo());

  test('antes: ping do proxy passa pelo fw', async () => {
    const wan = await fw.tcpdump('eth0', icmp);

    expect(proxy.ping(INTERNET).ok).toBe(true);

    const lines = await wan.stop();
    expect(lines).toContainPacket('echo request');
    expect(lines).toContainPacket('echo reply');
  });

  test('depois: ping para no fw, HTTPS continua', async () => {
    const rule = fw.iptables('-I FORWARD 1 -i eth1 -o eth0 -p icmp -j DROP');

    const lan = await fw.tcpdump('eth1', icmp);
    const wan = await fw.tcpdump('eth0', icmp);

    expect(proxy.ping(INTERNET).ok).toBe(false);
    expect(proxy.curl(HTTPS_INTERNET).ok).toBe(true);

    const lanLines = await lan.stop();
    expect(lanLines).toContainPacket('echo request');
    expect(lanLines).not.toContainPacket('echo reply');
    expect(await wan.stop()).toHaveLength(0);
    expect(rule.packets()).toBeGreaterThan(0);
  });
});

describe('L3 - Rede (B): bloqueio do destino 10.0.2.10 (site proibido)', () => {
  const syn80 = 'tcp port 80 and tcp[tcpflags] & tcp-syn != 0';

  beforeAll(() => {
    // O mesmo site (proxy reverso rp) responde por dois IPs
    rp.addIp('10.0.2.12/24');
    // O segundo IP fica liberado, como se estivesse na Internet
    fw.iptables('-A FORWARD -i eth1 -o eth2 -d 10.0.2.12 -p tcp --dport 80 -j ACCEPT');
  });

  afterAll(() => fw.undo());

  test('antes: pc1 e pc2 acessam o site pelos dois IPs', () => {
    for (const pc of [pc1, pc2]) {
      expect(pc.curl('http://10.0.2.10').body).toContain('WEB DMZ');
      expect(pc.curl('http://10.0.2.12').body).toContain('WEB DMZ');
    }
  });

  test('depois: toda a LAN perde o acesso ao IP 10.0.2.10', async () => {
    const rule = fw.iptables('-I FORWARD 1 -i eth1 -d 10.0.2.10 -j DROP');

    const lan = await fw.tcpdump('eth1', syn80);
    const dmz = await fw.tcpdump('eth2', syn80);

    expect(pc1.curl('http://10.0.2.10').ok).toBe(false);
    expect(pc2.curl('http://10.0.2.10').ok).toBe(false);

    expect(await lan.stop()).toContainPacket('> 10.0.2.10.80:');
    expect(await dmz.stop()).not.toContainPacket('> 10.0.2.10.80:');
    expect(rule.packets()).toBeGreaterThan(0);
  });

  test('limitacao: o mesmo site continua acessivel pelo outro IP', async () => {
    const dmz = await fw.tcpdump('eth2', syn80);

    expect(pc1.curl('http://10.0.2.12').body).toContain('WEB DMZ');
    expect(pc2.curl('http://10.0.2.12').body).toContain('WEB DMZ');

    expect(await dmz.stop()).toContainPacket('> 10.0.2.12.80:');
  });
});
