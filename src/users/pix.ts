// PIX "copia e cola" estático (BR Code, padrão EMV do Banco Central). Leva
// chave, valor e um txid por usuário: o comprovante chega com a identificação
// de quem pagou, em vez de o admin adivinhar pelo nome do pagador.

const field = (id: string, value: string) => `${id}${String(value.length).padStart(2, '0')}${value}`;

// CRC16-CCITT (polinômio 0x1021, início 0xFFFF), exigido no campo 63.
export function crc16(payload: string): string {
  let crc = 0xffff;
  for (const byte of Buffer.from(payload, 'utf8')) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

// Nome e cidade do recebedor: o padrão só aceita ASCII sem acento, com teto de
// 25 e 15 caracteres.
const ascii = (text: string, max: number) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9 ]/g, '')
    .trim()
    .slice(0, max);

export interface PixCharge {
  key: string;
  amount: number | null;
  txid: string;
  merchantName: string;
  merchantCity: string;
}

export function pixBrCode({ key, amount, txid, merchantName, merchantCity }: PixCharge): string {
  const payload = [
    field('00', '01'),
    field('26', field('00', 'br.gov.bcb.pix') + field('01', key)),
    field('52', '0000'),
    field('53', '986'),
    amount && amount > 0 ? field('54', amount.toFixed(2)) : '',
    field('58', 'BR'),
    field('59', ascii(merchantName, 25) || 'RECEBEDOR'),
    field('60', ascii(merchantCity, 15) || 'SAO PAULO'),
    field('62', field('05', txid.replace(/[^A-Za-z0-9]/g, '').slice(0, 25) || '***')),
    '6304',
  ].join('');
  return payload + crc16(payload);
}

// Identificador do pagamento de um usuário. Curto e fixo por conta: aparece no
// extrato do recebedor e é o que o admin procura pra liberar.
export const pixTxid = (userId: number) => `STS${userId}`;
