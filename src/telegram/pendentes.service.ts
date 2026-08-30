import { Injectable } from '@nestjs/common';
import { TipsService } from '../tips/tips.service';
import {
  escapeHtml,
  extractGameFromText,
  extractHouseFromText,
  extractLimitFromText,
  extractLinkFromText,
  extractMarketFromText,
  extractOddFromText,
} from './tip-parsing.util';

const KEYCAP_DIGITS = ['0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣'];

function toKeycapNumber(n: number): string {
  return String(n)
    .split('')
    .map((d) => KEYCAP_DIGITS[Number(d)])
    .join('');
}

function formatCompactMoney(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace('.', ',');
}

// Monta o resumo + lista paginada do /pendentes: total de tips relevantes
// pro filtro do usuário, quantas já viraram aposta, quantas foram marcadas
// como caiu, e a lista (agrupada por dia, paginada) das que ainda não têm
// nenhuma das duas coisas — sem paginação isso vira uma parede de botões
// quando acumula muita pendente.
@Injectable()
export class PendentesService {
  private static readonly PAGE_SIZE = 2;

  constructor(private readonly tipsService: TipsService) {}

  async buildMessage(user: { id: number; minPercentFilter?: number | null }, page = 0) {
    const minPercentFilter = user.minPercentFilter != null ? Number(user.minPercentFilter) : null;
    const rows = await this.tipsService.getSummaryForUser(user.id, minPercentFilter);
    const planilhadas = rows.filter((r) => r.betId != null).length;
    const caiu = rows.filter((r) => r.betId == null && r.dismissalId != null).length;
    const pendentes = rows.filter((r) => r.betId == null && r.dismissalId == null);

    const header = `📊 ${rows.length} · ✅${planilhadas} · ❌${caiu} · ⏳${pendentes.length}`;

    if (pendentes.length === 0) {
      return { text: `${header}\n\n🎉 Nada pendente!`, keyboard: undefined as any };
    }

    const pageSize = PendentesService.PAGE_SIZE;
    const totalPages = Math.ceil(pendentes.length / pageSize);
    const currentPage = Math.min(Math.max(page, 0), totalPages - 1);
    const pageItems = pendentes.slice(currentPage * pageSize, currentPage * pageSize + pageSize);

    let listText = '';
    const keyboardRows: any[] = [];
    let lastDateLabel = '';
    for (const [i, tip] of pageItems.entries()) {
      const dateLabel = new Date(tip.createdAt).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        timeZone: 'America/Sao_Paulo',
      });
      if (dateLabel !== lastDateLabel) {
        listText += `\n<b>${dateLabel}</b>\n`;
        lastDateLabel = dateLabel;
      }
      const counter = currentPage * pageSize + i + 1;
      const time = new Date(tip.createdAt).toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'America/Sao_Paulo',
      });
      const house = escapeHtml(extractHouseFromText(tip.text) ?? '?');
      const game = escapeHtml(extractGameFromText(tip.text) ?? '?');
      const market = extractMarketFromText(tip.text);
      const odd = extractOddFromText(tip.text);
      const limit = extractLimitFromText(tip.text);
      const link = extractLinkFromText(tip.text);
      const percentLabel = tip.percent !== null ? `${Number(tip.percent).toFixed(2).replace('.', ',')}%` : '?';
      const oddLabel = odd !== null ? ` | 🏷${odd.toFixed(2)}` : '';
      const limitLabel = limit !== null ? ` | 🚦${formatCompactMoney(limit)}` : '';

      listText += `${toKeycapNumber(counter)} ${time} | ${house} | ${game}${oddLabel}${limitLabel} | ${percentLabel}\n`;
      if (tip.isAviso) listText += `   ⚠️ SOBRECARGA\n`;
      if (market) listText += `   ${escapeHtml(market)}\n`;
      // Link como texto curto clicável (não a URL crua) — evita poluir a
      // linha, e o link_preview_options: is_disabled no envio corta o card
      // de prévia gigante que o Telegram gera pra URL solta no texto.
      if (link) listText += `   🔗 <a href="${escapeHtml(link)}">Aposta</a>\n`;
      listText += '\n';

      keyboardRows.push([
        { text: '✅ Planilhar', callback_data: `lista_planilhar:${tip.id}:${currentPage}` },
        { text: '❌ Caiu', callback_data: `lista_caiu:${tip.id}:${currentPage}` },
        { text: '✏️ Editar', callback_data: `lista_editar:${tip.id}:${currentPage}` },
      ]);
    }

    if (totalPages > 1) {
      keyboardRows.push([
        currentPage > 0
          ? { text: '◀️ Anterior', callback_data: `lista_pagina:${currentPage - 1}` }
          : { text: ' ', callback_data: 'noop' },
        { text: `${currentPage + 1}/${totalPages}`, callback_data: 'noop' },
        currentPage < totalPages - 1
          ? { text: 'Próxima ▶️', callback_data: `lista_pagina:${currentPage + 1}` }
          : { text: ' ', callback_data: 'noop' },
      ]);

      // Salto de 10 em 10 páginas — só aparece quando a lista é grande o
      // suficiente pra valer a pena (senão Anterior/Próxima já resolve).
      const jump = 10;
      if (totalPages > jump) {
        keyboardRows.push([
          currentPage > 0
            ? { text: `⏪ -${jump}`, callback_data: `lista_pagina:${Math.max(0, currentPage - jump)}` }
            : { text: ' ', callback_data: 'noop' },
          currentPage < totalPages - 1
            ? { text: `+${jump} ⏩`, callback_data: `lista_pagina:${Math.min(totalPages - 1, currentPage + jump)}` }
            : { text: ' ', callback_data: 'noop' },
        ]);
      }
    }

    return { text: `${header}\n${listText}`.trimEnd(), keyboard: { inline_keyboard: keyboardRows } };
  }
}
