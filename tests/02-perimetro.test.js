const { pc1, pc2, web, r0, fw } = require('./lab');

describe('Etapa 2 - Politica do firewall de perimetro (Default Deny)', () => {
  beforeAll(() => fw.resetCounters());

  describe('permitido', () => {
    test('pc1 e pc2 acessam o proxy reverso (rp) em HTTP', () => {
      expect(pc1.curl('http://10.0.2.10').body).toContain('WEB DMZ');
      expect(pc2.curl('http://10.0.2.10').body).toContain('WEB DMZ');
    });

    test('pc1 e pc2 acessam o proxy reverso (rp) em HTTPS (certificado autoassinado)', () => {
      expect(pc1.curl('https://10.0.2.10', { insecure: true }).body).toContain('WEB DMZ');
      expect(pc2.curl('https://10.0.2.10', { insecure: true }).body).toContain('WEB DMZ');
    });

    test('Internet -> proxy reverso (r0 -> rp)', () => {
      expect(r0.curl('http://10.0.2.10').body).toContain('WEB DMZ');
    });

    test('LAN -> DNS da DMZ (porta 53 alcancavel)', () => {
      expect(pc1.tcp('10.0.2.11', 53)).not.toBe('BLOCKED');
    });

    test('respostas das conexoes permitidas passam pela regra stateful', () => {
      expect(fw.established()).toBeGreaterThan(0);
    });
  });

  describe('bloqueado', () => {
    test('pc1 e pc2 nao acessam o web diretamente (so pelo rp)', () => {
      expect(pc1.tcp('10.0.2.20', 80)).toBe('BLOCKED');
      expect(pc2.tcp('10.0.2.20', 80)).toBe('BLOCKED');
    });

    test('Internet nao acessa o web diretamente', () => {
      expect(r0.tcp('10.0.2.20', 80)).toBe('BLOCKED');
    });

    test('Internet -> LAN (estacoes e proxy)', () => {
      expect(r0.ping('10.0.4.10').ok).toBe(false);
      expect(r0.tcp('10.0.4.10', 22)).toBe('BLOCKED');
      expect(r0.tcp('10.0.1.20', 3128)).toBe('BLOCKED');
    });

    test('Internet -> DNS da DMZ', () => {
      expect(r0.tcp('10.0.2.11', 53)).toBe('BLOCKED');
    });

    test('DMZ -> LAN, conexao nova', () => {
      expect(web.ping('10.0.4.10').ok).toBe(false);
      expect(web.tcp('10.0.4.10', 22)).toBe('BLOCKED');
    });

    test('LAN -> DMZ fora dos servicos liberados', () => {
      expect(pc1.tcp('10.0.2.10', 22)).toBe('BLOCKED');
    });
  });
});
