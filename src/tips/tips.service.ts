import { Injectable } from '@nestjs/common';
import { TipsRepository } from '../infra/repository/tips.repository';
import { UsersService } from '../users/users.service';
import {
  extractGameFromText,
  extractHouseFromText,
  extractLimitFromText,
  extractLinkFromText,
  extractMarketFromText,
  extractOddFromText,
  extractPotentialProfitFromText,
  extractRecommendedStakeFromText,
  extractSportFromText,
} from '../telegram/utils/tip-extractors.util';
import type { TipItemDto, TipStatus, TipsListResponseDto } from './dto/tip.dto';
import type { NewTip, TipId, TipEntity } from '../db_types/Tips';
import type { NewTipDelivery } from '../db_types/TipDeliveries';
import type { UserId } from '../db_types/Users';

interface RecordTipData {
  chatId: number;
  messageId: number;
  text: string;
  percent: number | null;
  isAviso: boolean;
  hasMedia: boolean;
  entities: TipEntity[] | null;
}

interface SaveDeliveryData {
  tipId: number;
  userId: number;
  messageId: number;
  hasMedia: boolean;
  text: string;
  entities: TipEntity[] | null;
}

@Injectable()
export class TipsService {
  constructor(
    private readonly tipsRepository: TipsRepository,
    private readonly usersService: UsersService,
  ) {}

  // Mesma lista que o /pendentes do bot monta, só que estruturada em vez de
  // formatada em HTML: a tela do app precisa dos campos separados pra desenhar
  // o card. Nenhum desses campos existe em coluna — todos saem do texto da
  // mensagem. Os do canal vêm de `tips.text` (igual pra todo mundo); a stake
  // recomendada e o lucro só existem na cópia entregue a ESTE usuário.
  async listForUser(
    userId: number,
    { status, page, perPage }: { status?: TipStatus; page: number; perPage: number },
  ): Promise<TipsListResponseDto> {
    const user = await this.usersService.findById(userId);
    const minPercentFilter =
      user?.minPercentFilter != null ? Number(user.minPercentFilter) : null;

    const rows = await this.tipsRepository.findSummaryForUser(
      userId as UserId,
      minPercentFilter,
    );

    const items: TipItemDto[] = rows.map((row) => ({
      id: Number(row.id),
      createdAt: row.createdAt,
      status: row.betId != null ? 'planilhada' : row.dismissalId != null ? 'caiu' : 'pending',
      betId: row.betId != null ? Number(row.betId) : null,
      house: extractHouseFromText(row.text),
      game: extractGameFromText(row.text),
      sport: extractSportFromText(row.text),
      market: extractMarketFromText(row.text),
      odd: extractOddFromText(row.text),
      percent: row.percent != null ? Number(row.percent) : null,
      limit: extractLimitFromText(row.text),
      recommendedStake: extractRecommendedStakeFromText(row.deliveryText ?? ''),
      potentialProfit: extractPotentialProfitFromText(row.deliveryText ?? ''),
      link: extractLinkFromText(row.text),
      isAviso: row.isAviso,
      // A cópia entregue é a que o usuário reconhece (é a que ele leu na DM,
      // com a recomendação no fim). Sem entrega, mostra a do canal.
      text: row.deliveryText ?? row.text,
    }));

    const pendentes = items.filter((i) => i.status === 'pending');
    const summary = {
      pending: pendentes.length,
      planilhadas: items.filter((i) => i.status === 'planilhada').length,
      caidas: items.filter((i) => i.status === 'caiu').length,
      pendingStake: pendentes.reduce((sum, i) => sum + (i.recommendedStake ?? 0), 0),
    };

    // Mais recente primeiro: no bot a ordem crescente serve à numeração dos
    // botões; numa tela de lista o que acabou de chegar tem que estar no topo.
    const filtered = (status ? items.filter((i) => i.status === status) : items).reverse();

    // Paginação em memória, não no SQL: a query já traz tips + apostas + caiu
    // num join só pra poder classificar cada linha, e é dessa classificação que
    // sai o filtro de aba. Cortar no banco exigiria repetir essa lógica em SQL.
    const start = (page - 1) * perPage;

    return {
      data: filtered.slice(start, start + perPage),
      summary,
      total: filtered.length,
      page,
      perPage,
    };
  }

  async recordTip(data: RecordTipData) {
    const newTip: NewTip = {
      chatId: data.chatId,
      messageId: data.messageId,
      text: data.text,
      percent: data.percent,
      isAviso: data.isAviso,
      hasMedia: data.hasMedia,
      entities: data.entities ? JSON.stringify(data.entities) : null,
    };
    return this.tipsRepository.create(newTip);
  }

  async findById(tipId: number) {
    return this.tipsRepository.findById(tipId as TipId);
  }

  async getSummaryForUser(
    userId: number,
    minPercentFilter: number | null,
    since?: Date,
  ) {
    return this.tipsRepository.findSummaryForUser(
      userId as UserId,
      minPercentFilter,
      since,
    );
  }

  async dismissTip(tipId: number, userId: number) {
    return this.tipsRepository.dismiss(tipId as TipId, userId as UserId);
  }

  async undismissTip(tipId: number, userId: number) {
    return this.tipsRepository.undismiss(tipId as TipId, userId as UserId);
  }

  async saveDelivery(data: SaveDeliveryData) {
    const delivery: NewTipDelivery = {
      tipId: data.tipId as TipId,
      userId: data.userId as UserId,
      messageId: data.messageId,
      hasMedia: data.hasMedia,
      text: data.text,
      entities: data.entities ? JSON.stringify(data.entities) : null,
    };
    return this.tipsRepository.upsertDelivery(delivery);
  }

  async findDelivery(tipId: number, userId: number) {
    return this.tipsRepository.findDelivery(tipId as TipId, userId as UserId);
  }
}
