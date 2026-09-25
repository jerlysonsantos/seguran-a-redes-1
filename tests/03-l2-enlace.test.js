const { pc1, pc2, fw, INTERNET } = require('./lab');

describe('L2 - Enlace: bloqueio pelo MAC do pc2', () => {
  let macPc2;

  beforeAll(() => {
    macPc2 = pc2.mac();
  });

  afterAll(() => fw.undo());

  test('antes: pc1 e pc2 acessam a Internet', () => {
    expect(pc1.ping(INTERNET).ok).toBe(true);
    expect(pc2.ping(INTERNET).ok).toBe(true);
  });

  test('antes: o MAC do pc2 so aparece na LAN (eth1), o IP segue ate a WAN (eth0)', async () => {
    const eth1 = await fw.tcpdump('eth1', 'icmp', ['-e']);
    const eth0 = await fw.tcpdump('eth0', 'icmp', ['-e']);

    pc2.ping(INTERNET);

    expect(await eth1.stop()).toContainPacket(macPc2, `10.0.1.11 > ${INTERNET}`);
    const wan = await eth0.stop();
    expect(wan).toContainPacket(`10.0.1.11 > ${INTERNET}`);
    expect(wan).not.toContainPacket(macPc2);
  });

  test('depois: fw bloqueia o MAC do pc2', async () => {
    const rule = fw.iptables(`-I FORWARD 1 -i eth1 -m mac --mac-source ${macPc2} -j DROP`);
    fw.iptables(`-I INPUT 1 -i eth1 -m mac --mac-source ${macPc2} -j DROP`);

    const eth1 = await fw.tcpdump('eth1', 'icmp', ['-e']);
    const eth0 = await fw.tcpdump('eth0', 'icmp', ['-e']);

    expect(pc1.ping(INTERNET).ok).toBe(true);
    expect(pc2.ping(INTERNET).ok).toBe(false);

    // os pacotes do pc2 chegam ao fw, mas nao saem para a WAN
    expect(await eth1.stop()).toContainPacket(macPc2, `10.0.1.11 > ${INTERNET}`);
    expect(await eth0.stop()).not.toContainPacket('10.0.1.11 >');
    expect(rule.packets()).toBeGreaterThan(0);
  });

  test('depois: pc2 ainda alcanca o pc1 (trafego dentro da LAN nao passa pelo fw)', () => {
    expect(pc2.ping('10.0.1.10').ok).toBe(true);
  });
});
