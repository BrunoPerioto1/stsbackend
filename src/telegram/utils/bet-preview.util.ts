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

// Pendências parecidas com o print, já ordenadas por score. Só sugestão: o
// usuário responde clicando, nada é vinculado sozinho.
export interface PreviewMatch {
  tipId: number;
  score: number;
  label: string;
}

export function buildBetPreview(
  bet: ExtractedBetImage,
  house: string,
  timestamp: number,
  options: {
    deep?: boolean;
    allowDeep?: boolean;
    sourceType?: 'image' | 'audio';
    matches?: PreviewMatch[];
  } = {},
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
  const sourceType = options.sourceType === 'audio' ? 2 : 1;
  const matches = options.matches ?? [];
  const pergunta = matches.length
    ? `\n\n❓ Isso parece uma pendência que você já recebeu. É a mesma aposta?`
    : '';
  return {
    text: `${options.deep ? '✅ Análise profunda concluída!' : '✅ Aposta identificada!'}\n\n${card}${pergunta}`,
    reply_markup: {
      inline_keyboard: [
        // Vincular à pendência é o mesmo Planilhar, só com o tipId no
        // callback — nada de estado novo entre a pergunta e a resposta.
        ...matches.map((match) => [
          {
            text: `🔁 Sim — ${match.label}`,
            callback_data: `planilhar_ts:${timestamp}:${sourceType}:${match.tipId}`,
          },
        ]),
        [
          {
            text: matches.length
              ? '🆕 Não — planilhar como nova'
              : '📊 Planilhar',
            callback_data: `planilhar_ts:${timestamp}:${sourceType}`,
          },
        ],
        ...(options.allowDeep
          ? [[{ text: '🔎 Análise profunda', callback_data: 'bet_image_deep' }]]
          : []),
      ],
    },
  };
}
