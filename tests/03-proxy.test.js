const { pc1, pc2, fw, proxy, INTERNET, SITE, CACHE_SITE } = require('./lab');

// O proxy (Squid) e o gateway dos PCs:
//  - HTTP (80) para a Internet e desviado para o Squid (modo transparente)
//  - porta 3128: modo explicito (curl -x)
//  - o resto que nao foi liberado no proxy (ping, SSH...) nao sai
describe('Proxy (Squid) como gateway da LAN', () => {
  // O Squid grava o access.log de forma assincrona: espera a linha aparecer (ate 10s)
  const accessLog = (pattern) =>
    proxy.run(`for i in $(seq 20); do tail -n 50 /var/log/squid/access.log | grep -E '${pattern}' && exit 0; sleep 0.5; done; exit 1`);

  // URL do CACHE_SITE como aparece no access.log (ex.: http://example\.com)
  const cacheUrl = new URL(CACHE_SITE).origin.replace(/\./g, '\\.');

  test('pc1 acessa a Internet em HTTP pelo proxy transparente', () => {
    expect(pc1.curl(CACHE_SITE, { timeout: 10 }).ok).toBe(true);
    expect(accessLog(`10\\.0\\.4\\.10 TCP_[A-Z_]+/200 .* GET ${cacheUrl}`).ok).toBe(true);
  });

  test('pc2 recebe o mesmo site do cache do proxy', () => {
    expect(pc2.curl(CACHE_SITE, { timeout: 10 }).ok).toBe(true);
    expect(accessLog(`10\\.0\\.4\\.11 TCP_[A-Z_]*HIT/200 .* GET ${cacheUrl}`).ok).toBe(true);
  });

  test('pc1 e pc2 tambem usam o proxy no modo explicito (porta 3128)', () => {
    expect(pc1.curl(SITE, { proxy: 'http://10.0.4.1:3128', timeout: 10 }).ok).toBe(true);
    expect(pc2.curl(SITE, { proxy: 'http://10.0.4.1:3128', timeout: 10 }).ok).toBe(true);
  });

  test('na WAN o HTTP sai com o IP do proxy, nao com o do PC', async () => {
    // qualquer pacote para a porta 80 (o Squid pode reaproveitar uma conexao ja aberta, sem SYN novo)
    const wan = await fw.tcpdump('eth0', 'tcp dst port 80');

    // URL unica (?t=...) para nao ser respondida pelo cache, que nao gera trafego na WAN
    pc1.curl(`http://example.org/?t=${Date.now()}`, { timeout: 10 });

    const lines = await wan.stop();
    expect(lines).toContainPacket('10.0.1.20.', '.80:');
    expect(lines).not.toContainPacket('10.0.4.10.');
  });

  test('o que o proxy nao libera nao sai (ping e SSH para a Internet)', async () => {
    const lan = await fw.tcpdump('eth1', 'host 10.0.4.10 and (icmp or tcp port 22)');

    expect(pc1.ping(INTERNET).ok).toBe(false);
    expect(pc1.tcp('1.1.1.1', 22)).toBe('BLOCKED');

    // os pacotes morrem no proxy: nem chegam ao fw
    expect(await lan.stop()).toHaveLength(0);
  });
});
