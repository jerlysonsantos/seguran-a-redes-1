const { web, fw, INTERNET } = require('./lab');

// Cenario: o web da DMZ foi comprometido e o atacante executa comandos nele
describe('Defense in Depth: web da DMZ comprometido', () => {
  test('segmentacao + regras stateful: web nao inicia conexao com a LAN', async () => {
    const eth2 = await fw.tcpdump('eth2', 'src host 10.0.2.10');
    const eth1 = await fw.tcpdump('eth1', 'src host 10.0.2.10');

    expect(web.ping('10.0.1.10').ok).toBe(false);
    expect(web.ping('10.0.1.11').ok).toBe(false);
    expect(web.tcp('10.0.1.10', 22)).toBe('BLOCKED');

    // as tentativas chegam ao fw, mas nada sai para a LAN
    expect((await eth2.stop()).length).toBeGreaterThan(0);
    expect(await eth1.stop()).toHaveLength(0);
  });

  test('filtragem de saida: web nao acessa a Internet (sem C2 ou exfiltracao)', async () => {
    const eth0 = await fw.tcpdump('eth0', 'src host 10.0.2.10');

    expect(web.ping(INTERNET).ok).toBe(false);
    expect(web.tcp('1.1.1.1', 80)).toBe('BLOCKED');

    expect(await eth0.stop()).toHaveLength(0);
  });

  test('web nao alcanca o proprio fw nem a rede de gerencia', () => {
    expect(web.ping('10.0.2.1').ok).toBe(false);
    expect(web.ping('10.0.3.10').ok).toBe(false);
  });

  test('ponto fraco: web alcanca o dns no mesmo segmento (movimento lateral)', () => {
    expect(web.ping('10.0.2.11').ok).toBe(true);
    expect(web.tcp('10.0.2.11', 53)).not.toBe('BLOCKED');
  });
});
