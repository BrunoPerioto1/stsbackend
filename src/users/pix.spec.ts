import { pixBrCode } from './pix';
import { createPayToken, readPayToken } from './pay-token';

// Dinheiro e acesso: código PIX válido e token de renovação que não se falsifica.
describe('PIX e renovação', () => {
  it('reproduz o exemplo do manual do Banco Central (CRC incluído)', () => {
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

  it('token de renovação vale pro dono e recusa adulterado ou vencido', () => {
    process.env.JWT_SECRET = 'segredo-de-teste';
    const token = createPayToken(42);
    expect(readPayToken(token)).toBe(42);
    expect(readPayToken(token.replace(/^42\./, '43.'))).toBeNull();
    expect(readPayToken(createPayToken(42, Date.now() - 2 * 86_400_000))).toBeNull();
  });
});
