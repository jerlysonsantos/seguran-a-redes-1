const { pc1, pc2, fw, proxy, HTTPS_INTERNET } = require('./lab');

// Topologia:
//   pc1 (10.0.4.10), pc2 (10.0.4.11) -> proxy (gw 10.0.4.1 / 10.0.1.20) -> fw -> r0 -> Internet
//   DMZ: rp (SWAG, 10.0.2.10) -> web (Apache, 10.0.2.20)
describe('Etapa 1 - Baseline: conectividade e encaminhamento', () => {
  test('LAN -> Internet via proxy (HTTPS roteado)', () => {
    expect(pc1.curl(HTTPS_INTERNET).ok).toBe(true);
    expect(pc2.curl(HTTPS_INTERNET).ok).toBe(true);
  });

  test('LAN -> site da DMZ pelo proxy reverso (rp)', () => {
    expect(pc1.curl('http://10.0.2.10').body).toContain('WEB DMZ');
    expect(pc2.curl('http://10.0.2.10').body).toContain('WEB DMZ');
  });

  test('LAN -> DNS da DMZ (porta 53 alcancavel)', () => {
    expect(pc1.tcp('10.0.2.11', 53)).not.toBe('BLOCKED');
  });

  test('o proxy e o fw encaminham o trafego do pc1 ate a WAN', async () => {
    const filter = 'tcp port 443 and host 10.0.4.10';
    const pcSide = await proxy.tcpdump('eth1', filter);
    const lan = await fw.tcpdump('eth1', filter);
    const wan = await fw.tcpdump('eth0', filter);

    pc1.curl(HTTPS_INTERNET);

    // o mesmo pacote passa pelas tres interfaces: proxy (lado dos PCs) -> fw LAN -> fw WAN
    expect(await pcSide.stop()).toContainPacket('10.0.4.10.', '.443:');
    expect(await lan.stop()).toContainPacket('10.0.4.10.', '.443:');
    expect(await wan.stop()).toContainPacket('10.0.4.10.', '.443:');
  });
});
