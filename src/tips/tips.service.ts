import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { TipsRepository } from '../infra/repository/tips.repository';
import { UsersService } from '../users/users.service';
import { BetService } from '../bet/bet.service';
import { GrokService } from '../telegram/grok.service';
import { HouseService } from '../house/house.service';
import { matchHouseIdByName } from '../common/utils/house-match.util';
import { normalizeBetData } from '../bet/bet-normalization';
import { createMatchCache, matchEvent } from '../bet/event-matching';
import {
  DIAS_ANTES_RETIDOS,
  SportEventRepository,
} from '../infra/repository/sport-event.repository';
import type { CandidateEvent, MatchCache } from '../bet/event-matching';
import {
  extractCalcLinkFromEntities,
  extractGameFromText,
  extractHouseFromText,
  extractLimitFromText,
  extractLinkFromText,
  extractMarketFromText,
  extractOddFromText,
  extractPotentialProfitFromText,
  extractRecommendedStakeFromText,
  extractSportFromText,
  parseBetLocal,
} from '../telegram/utils/tip-extractors.util';
import type {
  PlanilharTipDto,
  TipItemDto,
  TipStatus,
  TipsListResponseDto,
} from './dto/tip.dto';
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
    private readonly betService: BetService,
    private readonly grokService: GrokService,
    private readonly houseService: HouseService,
    private readonly sportEventRepository: SportEventRepository,
  ) {}

  // Equivalente do botão "Planilhar" do /pendentes: grava a aposta na hora,
  // sem etapa de confirmação — é o clique que confirma. Os overrides existem
  // pro "Editar" da tela, que ajusta stake/odd/casa antes de gravar; sem eles
  // a conta é idêntica à do bot (banca × % da tip, cortada pelo 🚦).
  async planilharTip(
    tipId: number,
    userId: number,
    overrides: PlanilharTipDto = {},
  ) {
    const tip = await this.findById(tipId);
    if (!tip) throw new NotFoundException('Tip não encontrada.');

    // O bot trata segundo clique como no-op em vez de erro (mensagem antiga,
    // clique duplo). Mesma coisa aqui: devolve a aposta que já existe.
    const existing = await this.betService.findBetByTip(tipId, userId);
    if (existing) return { bet: existing, alreadyExisted: true };

    const parsed = parseBetLocal(tip.text);
    if (!parsed)
      throw new BadRequestException(
        'Não consegui ler jogo/mercado/odd dessa tip. Planilhe manualmente em Apostas.',
      );

    const houseId =
      overrides.houseId ?? (await this.grokService.resolveHouseId(tip.text));
    if (!houseId)
      throw new BadRequestException(
        'Não reconheci a casa dessa tip. Escolha a casa em Editar.',
      );

    const stake = overrides.stake ?? (await this.resolveStake(tip, userId));
    if (stake === null)
      throw new BadRequestException(
        'Não consegui calcular a stake dessa tip. Informe o valor em Editar.',
      );

    const odd = overrides.odd ?? parsed.odd;
    const { game, market, sport } = normalizeBetData(parsed);
    if (!game || !market || !sport)
      throw new BadRequestException('Dados da tip incompletos.');

    const bet = await this.betService.createBet(
      {
        userId,
        game,
        market,
        sport,
        odd,
        houseId,
        stake: Number(stake.toFixed(2)),
      } as any,
      tipId,
      { source: 'app', sourceType: 'manual' },
    );

    return { bet, alreadyExisted: false };
  }

  private async resolveStake(
    tip: { text: string; percent: number | null },
    userId: number,
  ): Promise<number | null> {
    const banca = await this.usersService.getUserStake(userId);
    return computeStake(tip.percent, tip.text, banca);
  }

  // Mesma lista que o /pendentes do bot monta, só que estruturada em vez de
  // formatada em HTML: a tela do app precisa dos campos separados pra desenhar
  // o card. Nenhum desses campos existe em coluna — todos saem do texto da
  // mensagem. Os do canal vêm de `tips.text` (igual pra todo mundo); a stake
  // recomendada e o lucro só existem na cópia entregue a ESTE usuário.
  async listForUser(
    userId: number,
    {
      status,
      q,
      houseIds,
      page,
      perPage,
    }: {
      status?: TipStatus;
      q?: string;
      houseIds?: number[];
      page: number;
      perPage: number;
    },
  ): Promise<TipsListResponseDto> {
    const user = await this.usersService.findById(userId);
    const minPercentFilter =
      user?.minPercentFilter != null ? Number(user.minPercentFilter) : null;

    // As casas entram aqui porque a casa da tip só existe como texto da
    // mensagem: o houseId sai do mesmo casamento de nome que o Planilhar usa,
    // e é ele que o filtro de casas da tela compara.
    const [rows, banca, houses, candidatos] = await Promise.all([
      this.tipsRepository.findSummaryForUser(userId as UserId, minPercentFilter),
      this.usersService.getUserStake(userId),
      this.houseService.getAllHouses(),
      // Uma consulta só pra lista inteira: o matcher compara nome em memória,
      // então a mesma janela de eventos serve todas as tips.
      this.findEventCandidates(),
    ]);

    const items: TipItemDto[] = rows.map((row) => {
      // A entrega tem o número que o usuário já viu na DM, então ela manda.
      // Sem entrega (tip anterior ao vínculo, ou filtrada na hora do fan-out)
      // refaz a mesma conta — é o que o Planilhar usaria de qualquer forma, e
      // o campo da tela precisa abrir preenchido pra valer a pena.
      const stake =
        extractRecommendedStakeFromText(row.deliveryText ?? '') ??
        computeStake(row.percent, row.text, banca);
      const odd = extractOddFromText(row.text);
      const houseName = extractHouseFromText(row.text);
      const gameName = extractGameFromText(row.text);
      const marketName = extractMarketFromText(row.text);
      const sportName = extractSportFromText(row.text);

      return {
        id: Number(row.id),
        createdAt: row.createdAt,
        status:
          row.betId != null
            ? 'planilhada'
            : row.dismissalId != null
              ? 'caiu'
              : 'pending',
        betId: row.betId != null ? Number(row.betId) : null,
        house: houseName,
        houseId: matchHouseIdByName(houseName, houses ?? []),
        game: gameName,
        sport: sportName,
        market: marketName,
        odd,
        percent: row.percent != null ? Number(row.percent) : null,
        limit: extractLimitFromText(row.text),
        recommendedStake: stake,
        potentialProfit:
          extractPotentialProfitFromText(row.deliveryText ?? '') ??
          (stake !== null && odd !== null
            ? Number((stake * odd - stake).toFixed(2))
            : null),
        link: extractLinkFromText(row.text),
        calcLink: extractCalcLinkFromEntities(row.text, row.entities),
        // Preenchido só pra página devolvida, lá embaixo: o casamento é caro
        // demais pra rodar no histórico inteiro.
        eventStartAt: null,
        isAviso: row.isAviso,
        // A cópia entregue é a que o usuário reconhece (é a que ele leu na DM,
        // com a recomendação no fim). Sem entrega, mostra a do canal.
        text: row.deliveryText ?? row.text,
      };
    });

    const pendentes = items.filter((i) => i.status === 'pending');
    const summary = {
      pending: pendentes.length,
      planilhadas: items.filter((i) => i.status === 'planilhada').length,
      caidas: items.filter((i) => i.status === 'caiu').length,
      pendingStake: pendentes.reduce((sum, i) => sum + (i.recommendedStake ?? 0), 0),
    };

    // Mais recente primeiro: no bot a ordem crescente serve à numeração dos
    // botões; numa tela de lista o que acabou de chegar tem que estar no topo.
    // Busca casa com jogo e mercado — os dois campos que o card mostra em
    // negrito, e o unico jeito de achar "aquela tip do Flamengo" numa fila
    // longa. Como ja e' tudo em memoria aqui, nao vale query nova.
    const termo = q?.trim().toLowerCase();
    const bateBusca = (i: TipItemDto) =>
      !termo ||
      `${i.game ?? ''} ${i.market ?? ''}`.toLowerCase().includes(termo);

    // Tip sem casa reconhecida fica de fora quando há filtro: o usuário pediu
    // casas específicas, e "não sei de qual é" não é uma delas.
    const daCasa = (i: TipItemDto) =>
      !houseIds?.length || (i.houseId !== null && houseIds.includes(i.houseId));

    const filtered = items
      .filter((i) => (!status || i.status === status) && bateBusca(i) && daCasa(i))
      .reverse();

    // Paginação em memória, não no SQL: a query já traz tips + apostas + caiu
    // num join só pra poder classificar cada linha, e é dessa classificação que
    // sai o filtro de aba. Cortar no banco exigiria repetir essa lógica em SQL.
    const start = (page - 1) * perPage;
    const pagina = filtered.slice(start, start + perPage);

    // O horário do jogo entra só agora, sobre a página já cortada. Casar nome
    // custa índice de tokens + Levenshtein sobre centenas de eventos; rodar
    // isso no histórico inteiro (o map acima) travava o request. O cache
    // constrói o índice uma vez pra página toda.
    const cache = createMatchCache();
    const data = pagina.map((item) => ({
      ...item,
      eventStartAt: resolveEventStartAt(
        item.game,
        item.market,
        item.sport,
        candidatos,
        cache,
      ),
    }));

    return {
      data,
      summary,
      total: filtered.length,
      page,
      perPage,
    };
  }

  // Consultivo igual ao da aposta: falha aqui não pode derrubar a lista de
  // tips, então erro vira cache vazio e as tips saem sem horário.
  private async findEventCandidates(): Promise<CandidateEvent[]> {
    try {
      return await this.sportEventRepository.findCandidates(
        new Date(),
        DIAS_ANTES_RETIDOS,
      );
    } catch (error) {
      console.warn('[TIP_EVENT] result=error', (error as Error).message);
      return [];
    }
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

// Mesma conta do processBetText do bot: a tip carrega só a % da banca, o
// valor absoluto sai dela, e o 🚦 do texto corta por cima quando existe.
function computeStake(
  percent: number | null,
  text: string,
  banca: number,
): number | null {
  if (percent === null) return null;
  let stake = (Number(percent) / 100) * banca;
  const limit = extractLimitFromText(text);
  if (limit !== null) stake = Math.min(stake, limit);
  return Number.isFinite(stake) && stake > 0 ? Number(stake.toFixed(2)) : null;
}

// Mesmo casamento que a aposta faz na hora de planilhar, só que aqui é só pra
// exibir: a tip ainda não virou aposta, e o horário é o que decide se dá tempo
// de entrar. Sem match confiável devolve null — data errada é pior que nenhuma.
function resolveEventStartAt(
  game: string | null,
  market: string | null,
  sport: string | null,
  candidatos: CandidateEvent[],
  cache: MatchCache,
): Date | null {
  if (!game || !candidatos.length) return null;
  try {
    return (
      matchEvent(game, market ?? '', candidatos, sport ?? undefined, cache)
        ?.startAt ?? null
    );
  } catch {
    return null;
  }
}
