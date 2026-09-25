const { pc1, web, r0, fw, INTERNET } = require('./lab');

describe('Etapa 2 - Politica do firewall de perimetro (Default Deny)', () => {
  beforeAll(() => {
    web.serveHttp(80, 'WEB DMZ');
    fw.resetCounters();
  });

  describe('permitido', () => {
    test('LAN -> Internet', () => {
      expect(pc1.ping(INTERNET).ok).toBe(true);
    });

    test('LAN -> Web da DMZ (HTTP)', () => {
      expect(pc1.curl('http://10.0.2.10').ok).toBe(true);
    });

    test('LAN -> DNS da DMZ (porta 53 alcancavel)', () => {
      expect(pc1.tcp('10.0.2.11', 53)).not.toBe('BLOCKED');
    });

    test('Internet -> Web da DMZ (r0 -> web)', () => {
      expect(r0.curl('http://10.0.2.10').ok).toBe(true);
    });

    test('respostas das conexoes permitidas passam pela regra stateful', () => {
      expect(fw.established()).toBeGreaterThan(0);
    });
  });

  describe('bloqueado', () => {
    test('Internet -> LAN', () => {
      expect(r0.ping('10.0.1.10').ok).toBe(false);
      expect(r0.tcp('10.0.1.10', 22)).toBe('BLOCKED');
    });

    test('Internet -> DNS da DMZ', () => {
      expect(r0.tcp('10.0.2.11', 53)).toBe('BLOCKED');
    });

    test('DMZ -> LAN, conexao nova', () => {
      expect(web.ping('10.0.1.10').ok).toBe(false);
      expect(web.tcp('10.0.1.10', 22)).toBe('BLOCKED');
    });

    test('LAN -> DMZ fora dos servicos liberados', () => {
      expect(pc1.ping('10.0.2.10').ok).toBe(false);
      expect(pc1.tcp('10.0.2.10', 22)).toBe('BLOCKED');
    });
  });
});
