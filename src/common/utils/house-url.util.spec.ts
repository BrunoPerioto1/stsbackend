import { normalizeFederalHouseUrl } from './house-url.util';

describe('normalizeFederalHouseUrl', () => {
  it('aceita domínio .bet.br com ou sem protocolo e força https', () => {
    expect(normalizeFederalHouseUrl('betano.bet.br')).toBe('https://betano.bet.br');
    expect(normalizeFederalHouseUrl('  http://www.bet365.bet.br/  ')).toBe('https://www.bet365.bet.br');
    expect(normalizeFederalHouseUrl('https://superbet.bet.br/apostas')).toBe('https://superbet.bet.br/apostas');
  });

  it('vazio limpa o link', () => {
    expect(normalizeFederalHouseUrl('')).toBeNull();
    expect(normalizeFederalHouseUrl('   ')).toBeNull();
    expect(normalizeFederalHouseUrl(null)).toBeNull();
  });

  it('aceita casa com autorização judicial da lista fechada', () => {
    expect(normalizeFederalHouseUrl('https://zeroum.bet/')).toBe('https://zeroum.bet');
    expect(normalizeFederalHouseUrl('zeroum.bet')).toBe('https://zeroum.bet');
    expect(() => normalizeFederalHouseUrl('https://zeroum.bet.golpe.com')).toThrow();
    expect(() => normalizeFederalHouseUrl('https://outra.bet')).toThrow();
  });

  it('recusa o que não é domínio federal', () => {
    expect(() => normalizeFederalHouseUrl('betano.com')).toThrow();
    expect(() => normalizeFederalHouseUrl('https://vbet.bet')).toThrow();
    expect(() => normalizeFederalHouseUrl('https://bet.br.golpe.com')).toThrow();
    expect(() => normalizeFederalHouseUrl('https://bet.br')).toThrow();
    expect(() => normalizeFederalHouseUrl('javascript:alert(1)')).toThrow();
  });
});
