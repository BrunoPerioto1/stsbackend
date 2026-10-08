import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { TipSourcesRepository, type TipSourceWrite } from '../infra/repository/tip-sources.repository';
import type { TipSourceId } from '../db_types/TipSources';
import type { UserId } from '../db_types/Users';
import { buildSourceCard, parseTemplate, readTemplate, type TipTemplate } from './tip-template';
import type { CreateTipSourceDTO, PreviewTipSourceDTO, UpdateTipSourceDTO } from './dto/tip-source.dto';
import { errorArgs } from '../common/utils/log';

// Quantas tips recentes de outros formatos o teste de conflito relê.
const CONFLICT_SAMPLE = 50;

export interface TranslatedTip {
  sourceId: TipSourceId;
  card: string;
}

/**
 * Fontes de tips: o admin cadastra o modelo de cada tipster que o repasse
 * copia pro grupo Tips; o fan-out traduz a mensagem pro card padrão antes de
 * gravar a tip. Ver tip-template.ts.
 */
@Injectable()
export class TipSourcesService {
  private readonly logger = new Logger(TipSourcesService.name);

  constructor(private readonly repository: TipSourcesRepository) {}

  async list() {
    const rows = await this.repository.list();
    return rows.map((row) => ({
      ...row,
      recentTips: Number(row.recentTips ?? 0),
      mutedBy: Number(row.mutedBy ?? 0),
    }));
  }

  async create(dto: CreateTipSourceDTO) {
    const template = toTemplate(dto.template);
    try {
      return await this.repository.create({
        name: dto.name,
        template,
        sampleText: dto.sampleText ?? null,
        isActive: dto.isActive ?? true,
      });
    } catch (error) {
      throw duplicateName(error, dto.name);
    }
  }

  async update(id: number, dto: UpdateTipSourceDTO) {
    const set: TipSourceWrite = {};
    if (dto.name !== undefined) set.name = dto.name;
    if (dto.template !== undefined) set.template = toTemplate(dto.template);
    if (dto.sampleText !== undefined) set.sampleText = dto.sampleText;
    if (dto.isActive !== undefined) set.isActive = dto.isActive;
    // Um UPDATE sem coluna seria 500.
    if (Object.keys(set).length === 0) throw new BadRequestException('Nada para atualizar');

    let row;
    try {
      row = await this.repository.update(id as TipSourceId, set);
    } catch (error) {
      throw duplicateName(error, dto.name ?? '');
    }
    if (!row) throw new NotFoundException('Fonte não encontrada');
    return row;
  }

  async remove(id: number) {
    if ((await this.repository.delete(id as TipSourceId)) === 0) {
      throw new NotFoundException('Fonte não encontrada');
    }
  }

  /**
   * O que a tela mostra enquanto o admin monta o modelo: o que cada campo leu
   * no exemplo, o card que o usuário receberia e quantas tips recentes de
   * outros formatos o modelo também leria. Conflito > 0 quer dizer que este
   * modelo roubaria mensagem de outra fonte (ou do formato padrão): falta um
   * identificador.
   */
  async preview(dto: PreviewTipSourceDTO) {
    let template: TipTemplate;
    try {
      template = parseTemplate(dto.template, { partial: true });
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }

    const reading = readTemplate(dto.text, template);
    const card = reading.values ? buildSourceCard(dto.name || 'Nome da fonte', reading.values) : null;

    let conflicts = 0;
    let checked = 0;
    if (reading.values) {
      const recent = await this.repository.recentTextsOutside(
        dto.id === undefined ? null : (dto.id as TipSourceId),
        CONFLICT_SAMPLE,
      );
      checked = recent.length;
      conflicts = recent.filter((row) => readTemplate(row.text, template).values !== null).length;
    }

    return { markerFound: reading.markerFound, fields: reading.fields, card, conflicts, checked };
  }

  /**
   * Tradução na entrada do grupo Tips: a primeira fonte ativa (por id) cujo
   * modelo lê a mensagem. null = nenhuma leu, segue como formato padrão.
   * Nunca lança — fonte com defeito não pode derrubar a tip de sempre.
   */
  async translate(text: string): Promise<TranslatedTip | null> {
    let sources: Awaited<ReturnType<TipSourcesRepository['listActive']>>;
    try {
      sources = await this.repository.listActive();
    } catch (error) {
      this.logger.error(...errorArgs('⚠️ Não deu pra carregar as fontes de tips; segue no formato padrão', error));
      return null;
    }

    for (const source of sources) {
      try {
        const { values } = readTemplate(text, source.template);
        if (values) return { sourceId: source.id, card: buildSourceCard(source.name, values) };
      } catch (error) {
        this.logger.error(...errorArgs(`⚠️ Modelo da fonte ${source.id} falhou`, error));
      }
    }
    return null;
  }

  mutedUserIds(sourceId: TipSourceId) {
    return this.repository.mutedUserIds(sourceId);
  }

  listForUser(userId: number) {
    return this.repository.listForUser(userId as UserId);
  }

  async setEnabled(userId: number, sourceId: number, enabled: boolean) {
    if (!(await this.repository.exists(sourceId as TipSourceId))) {
      throw new NotFoundException('Fonte não encontrada');
    }
    await this.repository.setMuted(userId as UserId, sourceId as TipSourceId, !enabled);
    return { id: sourceId, enabled };
  }
}

function toTemplate(input: unknown): TipTemplate {
  try {
    return parseTemplate(input);
  } catch (error) {
    throw new BadRequestException((error as Error).message);
  }
}

function duplicateName(error: unknown, name: string) {
  if ((error as { code?: string } | null)?.code === '23505') {
    return new BadRequestException(`Já existe uma fonte chamada "${name}"`);
  }
  return error;
}
