import { crc16, pixBrCode, pixTxid } from './pix';
import { createPayToken, readPayToken } from './pay-token';
import { accessStatus, billingInfo } from './access';

describe('PIX copia e cola', () => {
  it('CRC16-CCITT bate com o valor de conferência do padrão', () => {
    expect(crc16('123456789')).toBe('29B1');
  });

  it('reproduz o exemplo do manual do Banco Central', () => {
    expect(
      pixBrCode({
        key: '123e4567-e12b-12d1-a456-426655440000',
        amount: null,
        txid: '***',
        merchantName: 'Fulano de Tal',
        merchantCity: 'BRASILIA',
      }),
    ).toBe(
      '00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***63041D3D',
    );
  });

  it('leva valor e txid do usuário, sem acento no nome', () => {
    const code = pixBrCode({
      key: 'chave@pix.com',
      amount: 40,
      txid: pixTxid(12),
      merchantName: 'João Pagamentos',
      merchantCity: 'São Paulo',
    });
    expect(code).toContain('540540.00');
    expect(code).toContain('0505STS12');
    expect(code).toContain('5915Joao Pagamentos');
    expect(code).toContain('6009Sao Paulo');
    expect(code.slice(-4)).toBe(crc16(code.slice(0, -4)));
  });

  it('billingInfo só gera o código com usuário e chave', () => {
    process.env.PIX_KEY = 'chave@pix.com';
    process.env.ACCESS_PRICE = '40';
    expect(billingInfo().pixCode).toBeNull();
    expect(billingInfo(7)).toMatchObject({ txid: 'STS7', price: 40 });
    expect(billingInfo(7).pixCode).toContain('0504STS7');
  });
});

describe('payToken da renovação', () => {
  beforeAll(() => {
    process.env.JWT_SECRET = 'segredo-de-teste';
  });

  it('volta o userId enquanto vale', () => {
    expect(readPayToken(createPayToken(42))).toBe(42);
  });

  it('recusa token adulterado ou vencido', () => {
    const token = createPayToken(42);
    expect(readPayToken(token.replace(/^42\./, '43.'))).toBeNull();
    expect(readPayToken(createPayToken(42, Date.now() - 2 * 86_400_000))).toBeNull();
    expect(readPayToken('lixo')).toBeNull();
    expect(readPayToken(undefined)).toBeNull();
  });
});

describe('accessStatus', () => {
  const createdAt = new Date('2026-09-01T12:00:00Z');

  it('conta que nunca pagou é nova, não vencida', () => {
    process.env.TRIAL_DAYS = '0';
    expect(accessStatus({ isActive: true, accessUntil: createdAt, createdAt })).toBe('new');
  });

  it('depois de liberada uma vez, vencer é vencer', () => {
    process.env.TRIAL_DAYS = '0';
    expect(
      accessStatus({ isActive: true, accessUntil: new Date('2026-09-20T12:00:00Z'), createdAt }),
    ).toBe('expired');
  });
});
