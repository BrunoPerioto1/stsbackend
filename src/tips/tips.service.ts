import { BadRequestException, Injectable, NotFoundException, Logger } from '@nestjs/common';
import { TipsRepository } from '../infra/repository/tips.repository';
import { UsersService } from '../users/users.service';
import { BetService, TipAlreadyPlanilhadaException } from '../bet/bet.service';
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
  private readonly logger = new Logger(TipsService.name);

  constructor(
    private readonly tipsRepository: TipsRepository,
    private readonly usersService: UsersService,
    private readonly betService: BetService,
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
      overrides.houseId ?? (await this.houseService.resolveHouseIdFromText(tip.text));
    if (!houseId)
      throw new BadRequestException(
        'Não reconheci a casa dessa tip. Escolha a casa em Editar.',
      );

    const stake = overrides.stake ?? (await this.resolveStake(tip, userId));
    if (stake === null)
      throw new BadRequestException(
        'Não consegui calcular a stake dessa tip. Informe o valor em Editar ou defina sua banca no Perfil.',
      );

    const odd = overrides.odd ?? parsed.odd;
    const { game, market, sport } = normalizeBetData(parsed);
    if (!game || !market || !sport)
      throw new BadRequestException('Dados da tip incompletos.');

    try {
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
    } catch (error) {
      // Clique duplo: os dois passaram pela consulta acima antes de qualquer
      // insert, e o índice único barrou o segundo.
      if (!(error instanceof TipAlreadyPlanilhadaException)) throw error;
      const bet = await this.betService.findBetByTip(tipId, userId);
      if (!bet) throw error;
      return { bet, alreadyExisted: true };
    }
  }

  // A entrega manda, igual à lista: é a "🎯 Recomendação de aposta" que o
  // usuário viu na DM. Sem entrega, refaz a conta com a banca de agora.
  private async resolveStake(
    tip: { id: number; text: string; percent: number | null },
    userId: number,
  ): Promise<number | null> {
    const delivery = await this.findDelivery(tip.id, userId);
    const delivered = extractRecommendedStakeFromText(delivery?.text ?? '');
    if (delivered !== null) return delivered;
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
    const uid = userId as UserId;
    const filter = { status, q };
    // A casa da tip só existe como texto e é casada por nome com as casas
    // cadastradas — isso não roda em SQL. Com filtro de casa, o banco devolve
    // só o que passou em status e busca, e a casa é filtrada aqui. Sem ele (o
    // caso comum), a página inteira sai do banco já cortada.
    const filtraCasa = !!houseIds?.length;

    const [counts, pendentes, pageRows, banca, houses, candidatos] = await Promise.all([
      this.tipsRepository.countByStatus(uid, minPercentFilter),
      // Só pra somar a stake das pendentes: é o conjunto pequeno (janela de 48h).
      this.tipsRepository.findListRows(uid, minPercentFilter, { status: 'pending' }),
      this.tipsRepository.findListRows(
        uid,
        minPercentFilter,
        filter,
        filtraCasa ? undefined : { limit: perPage, offset: (page - 1) * perPage },
      ),
      this.usersService.getUserStake(userId),
      this.houseService.getAllHouses(),
      // Uma consulta só pra página inteira: o matcher compara nome em memória,
      // então a mesma janela de eventos serve todas as tips.
      this.findEventCandidates(),
    ]);

    // Poucos nomes de casa distintos se repetem em milhares de tips, e o
    // casamento por similaridade contra todas as casas custava ~600ms por
    // request. Mesmo nome + mesma lista = mesmo resultado, entao lembra aqui.
    const houseIdByName = new Map<string | null, number | null>();
    const houseIdOf = (name: string | null) => {
      if (!houseIdByName.has(name)) houseIdByName.set(name, matchHouseIdByName(name, houses ?? []));
      return houseIdByName.get(name)!;
    };

    type Row = (typeof pageRows)[number];
    const toItem = (row: Row): TipItemDto => {
      // A entrega tem o número que o usuário já viu na DM, então ela manda.
      // Sem entrega (tip anterior ao vínculo, ou filtrada na hora do fan-out)
      // refaz a mesma conta — é o que o Planilhar usaria de qualquer forma, e
      // o campo da tela precisa abrir preenchido pra valer a pena.
      const stake =
        extractRecommendedStakeFromText(row.deliveryText ?? '') ??
        computeStake(row.percent, row.text, banca);
      const odd = extractOddFromText(row.text);
      const houseName = extractHouseFromText(row.text);
      const houseId = houseIdOf(houseName);

      return {
        id: Number(row.id),
        createdAt: row.createdAt,
        status: row.betId != null ? 'planilhada' : row.dismissalId != null ? 'caiu' : 'pending',
        betId: row.betId != null ? Number(row.betId) : null,
        // Nome cadastrado quando casou: o canal escreve "bet365", a lista de
        // apostas mostra "BET365" — a mesma casa com duas grafias na tela.
        house: houses?.find((h) => h.id === houseId)?.name ?? houseName,
        houseId,
        game: extractGameFromText(row.text),
        sport: extractSportFromText(row.text),
        market: extractMarketFromText(row.text),
        odd,
        percent: row.percent != null ? Number(row.percent) : null,
        limit: extractLimitFromText(row.text),
        recommendedStake: stake,
        potentialProfit:
          extractPotentialProfitFromText(row.deliveryText ?? '') ??
          (stake !== null && odd !== null ? Number((stake * odd - stake).toFixed(2)) : null),
        link: extractLinkFromText(row.text),
        calcLink: extractCalcLinkFromEntities(row.text, row.entities),
        // Tip já planilhada carrega o horário que a aposta gravou na criação.
        // Só quem não tem aposta precisa do casamento, e ele roda lá embaixo,
        // sobre a página devolvida: é caro demais pro histórico inteiro.
        eventStartAt: row.betEventStartAt ?? null,
        isAviso: row.isAviso,
        // A cópia entregue é a que o usuário reconhece (é a que ele leu na DM,
        // com a recomendação no fim). Sem entrega, mostra a do canal.
        text: row.deliveryText ?? row.text,
      };
    };

    const summary = {
      ...counts,
      pendingStake: pendentes.map(toItem).reduce((sum, i) => sum + (i.recommendedStake ?? 0), 0),
    };

    // Tip sem casa reconhecida fica de fora quando há filtro: o usuário pediu
    // casas específicas, e "não sei de qual é" não é uma delas.
    let pagina: TipItemDto[];
    let total: number;
    if (filtraCasa) {
      const daCasa = pageRows
        .map(toItem)
        .filter((i) => i.houseId !== null && houseIds.includes(i.houseId));
      total = daCasa.length;
      pagina = daCasa.slice((page - 1) * perPage, page * perPage);
    } else {
      pagina = pageRows.map(toItem);
      total = await this.tipsRepository.countListRows(uid, minPercentFilter, filter);
    }

    // O horário do jogo entra só agora, sobre a página já cortada. Casar nome
    // custa índice de tokens + Levenshtein sobre centenas de eventos; rodar
    // isso no histórico inteiro travava o request. O cache constrói o índice
    // uma vez pra página toda.
    const cache = createMatchCache();
    const data = pagina.map((item) => ({
      ...item,
      eventStartAt:
        item.eventStartAt ??
        resolveEventStartAt(item.game, item.market, item.sport, candidatos, cache),
    }));

    return {
      data,
      summary,
      total,
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
      this.logger.warn(`[TIP_EVENT] result=error ${(error as Error).message}`);
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

  // Número do menu (badge de Tips). Só a contagem, com o mesmo filtro de % da
  // lista: montar a lista inteira pra ler um número custaria o casamento de
  // casas e eventos a cada troca de tela.
  async countsForUser(userId: number) {
    const user = await this.usersService.findById(userId);
    const minPercentFilter =
      user?.minPercentFilter != null ? Number(user.minPercentFilter) : null;
    return this.tipsRepository.countByStatus(userId as UserId, minPercentFilter);
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
// Sem banca definida não há stake: a tela pede o valor em Editar.
function computeStake(
  percent: number | null,
  text: string,
  banca: number | null,
): number | null {
  if (percent === null || banca === null) return null;
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
