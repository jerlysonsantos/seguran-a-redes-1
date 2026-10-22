const { pc1, pc2, fw, proxy, HTTPS_INTERNET } = require('./lab');

// Os PCs ficam atras do proxy: o MAC deles so existe no segmento 10.0.4.0/24.
// Por isso o bloqueio por MAC e feito no proxy, nao no fw.
describe('L2 - Enlace: bloqueio pelo MAC do pc2', () => {
  let macPc2;
  const https443 = 'tcp port 443 and host 10.0.4.11';

  beforeAll(() => {
    macPc2 = pc2.mac();
  });

  afterAll(() => proxy.undo());

  test('antes: pc1 e pc2 acessam a Internet', () => {
    expect(pc1.curl(HTTPS_INTERNET).ok).toBe(true);
    expect(pc2.curl(HTTPS_INTERNET).ok).toBe(true);
  });

  test('antes: o MAC do pc2 so aparece no proxy; o fw so ve o IP', async () => {
    const pcSide = await proxy.tcpdump('eth1', https443, ['-e']);
    const lan = await fw.tcpdump('eth1', https443, ['-e']);

    pc2.curl(HTTPS_INTERNET);

    expect(await pcSide.stop()).toContainPacket(macPc2, '10.0.4.11.');
    const fwLines = await lan.stop();
    expect(fwLines).toContainPacket('10.0.4.11.');
    expect(fwLines).not.toContainPacket(macPc2);
  });

  test('depois: o proxy bloqueia o MAC do pc2', async () => {
    // FORWARD: trafego roteado (HTTPS, DNS, DMZ); INPUT: HTTP desviado para o Squid
    const rule = proxy.iptables(`-I FORWARD 1 -i eth1 -m mac --mac-source ${macPc2} -j DROP`);
    proxy.iptables(`-I INPUT 1 -i eth1 -m mac --mac-source ${macPc2} -j DROP`);

    const pcSide = await proxy.tcpdump('eth1', https443, ['-e']);
    const lan = await fw.tcpdump('eth1', https443);

    expect(pc1.curl(HTTPS_INTERNET).ok).toBe(true);
    expect(pc2.curl(HTTPS_INTERNET).ok).toBe(false);
    expect(pc2.curl('http://10.0.2.10').ok).toBe(false);

    // os pacotes do pc2 chegam ao proxy, mas nao seguem para o fw
    expect(await pcSide.stop()).toContainPacket(macPc2, '10.0.4.11.');
    expect(await lan.stop()).toHaveLength(0);
    expect(rule.packets()).toBeGreaterThan(0);
  });

  test('depois: pc2 ainda alcanca o pc1 (trafego no mesmo segmento nao passa pelo proxy)', () => {
    expect(pc2.ping('10.0.4.10').ok).toBe(true);
  });
});
