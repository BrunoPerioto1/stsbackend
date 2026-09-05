import type { ExtractedBetImage } from '../bet-image.service';

export function missingBetFields(bet: ExtractedBetImage): string[] {
  const fields: string[] = [];
  if (!bet.evento) fields.push('Jogo');
  if (!bet.esporte) fields.push('Esporte');
  if (!bet.mercado) fields.push('Mercado');
  if (bet.odd === null || !Number.isFinite(bet.odd) || bet.odd <= 1)
    fields.push('Odd');
  if (bet.stake === null || !Number.isFinite(bet.stake) || bet.stake <= 0)
    fields.push('Stake');
  return fields;
}

export function buildBetPreview(
  bet: ExtractedBetImage,
  house: string,
  timestamp: number,
  options: { deep?: boolean; allowDeep?: boolean } = {},
) {
  if (!house.trim() || missingBetFields(bet).length)
    throw new Error('APOSTA_INCOMPLETA');
  // Mantém o contrato do parser textual e evita tratar stake como percentual.
  const oneLine = (s: string) => s.replace(/\s*\n\s*/g, ' ').replace(/%/g, '');
  const card =
    `🏠 ${oneLine(house)}\n` +
    `🆚 ${oneLine(bet.evento!)}\n⚽️ ${oneLine(bet.esporte!)}\n` +
    `📌 ${oneLine(bet.mercado!)}\n🏷 ${bet.odd!.toFixed(2)}\n` +
    `💰 Stake: R$ ${bet.stake!.toFixed(2).replace('.', ',')}`;
  return {
    text: `${options.deep ? '✅ Análise profunda concluída!' : '✅ Aposta identificada!'}\n\n${card}`,
    reply_markup: {
      inline_keyboard: [
        [{ text: '📊 Planilhar', callback_data: `planilhar_ts:${timestamp}` }],
        ...(options.allowDeep
          ? [[{ text: '🔎 Análise profunda', callback_data: 'bet_image_deep' }]]
          : []),
      ],
    },
  };
}
