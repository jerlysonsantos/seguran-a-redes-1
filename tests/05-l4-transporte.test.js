const { pc1, web, fw } = require('./lab');

describe('L4 - Transporte: bloqueio de portas P2P (BitTorrent)', () => {
  const filter = 'udp port 6881 or (tcp[tcpflags] & tcp-syn != 0 and (tcp port 6881 or tcp port 51413))';

  beforeAll(() => {
    // "Peer" P2P na DMZ: porta classica 6881 (TCP/UDP) e porta alternativa 51413
    web.serveHttp(6881, 'PEER P2P');
    web.serveHttp(51413, 'PEER P2P');
    web.serveUdp(6881);
    // A politica base so libera 80/443 para o web: libera as portas do teste
    fw.iptables('-A FORWARD -i eth1 -o eth2 -d 10.0.2.10 -p tcp -m multiport --dports 6881:6889,51413 -j ACCEPT');
    fw.iptables('-A FORWARD -i eth1 -o eth2 -d 10.0.2.10 -p udp -m multiport --dports 6881:6889,51413 -j ACCEPT');
  });

  afterAll(() => fw.undo());

  test('antes: TCP 6881, UDP 6881 e TCP 51413 respondem', async () => {
    const eth2 = await fw.tcpdump('eth2', filter);

    expect(pc1.curl('http://10.0.2.10:6881').body).toBe('PEER P2P');
    expect(pc1.udp('10.0.2.10', 6881).response).toBe('PONG');
    expect(pc1.curl('http://10.0.2.10:51413').body).toBe('PEER P2P');

    const dmz = await eth2.stop();
    expect(dmz).toContainPacket('> 10.0.2.10.6881:', 'Flags [S]');
    expect(dmz).toContainPacket('> 10.0.2.10.6881:', 'UDP');
    expect(dmz).toContainPacket('> 10.0.2.10.51413:');
  });

  test('depois: portas do BitTorrent bloqueadas', async () => {
    const tcp = fw.iptables('-I FORWARD 1 -i eth1 -p tcp -m multiport --dports 6881:6889,6969 -j DROP');
    const udp = fw.iptables('-I FORWARD 1 -i eth1 -p udp -m multiport --dports 6881:6889,6969 -j DROP');

    const eth1 = await fw.tcpdump('eth1', filter);
    const eth2 = await fw.tcpdump('eth2', filter);

    expect(pc1.curl('http://10.0.2.10:6881').ok).toBe(false);
    expect(pc1.udp('10.0.2.10', 6881).ok).toBe(false);

    expect(await eth1.stop()).toContainPacket('> 10.0.2.10.6881:');
    expect(await eth2.stop()).not.toContainPacket('> 10.0.2.10.6881:');
    expect(tcp.packets()).toBeGreaterThan(0);
    expect(udp.packets()).toBeGreaterThan(0);
  });

  test('limitacao: a porta alternativa 51413 contorna o bloqueio', async () => {
    const eth2 = await fw.tcpdump('eth2', filter);

    expect(pc1.curl('http://10.0.2.10:51413').body).toBe('PEER P2P');

    expect(await eth2.stop()).toContainPacket('> 10.0.2.10.51413:');
  });
});
