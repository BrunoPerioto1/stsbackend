import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ScannerRepository, type ScannerFlags } from '../infra/repository/scanner.repository';
import { CreateScannerTournamentDTO, UpdateScannerFlagsDTO } from './dto/admin.dto';
import type { SportId } from '../db_types/Sports';

/**
 * Configuração do scanner do SofaScore. Os jobs Python leem a mesma tabela a
 * cada execução; as regras de quem lê o quê estão em docs/scanner.md.
 */
@Injectable()
export class ScannerService {
  constructor(private readonly scannerRepository: ScannerRepository) {}

  /**
   * `coverageGaps`: seções da amostra que vieram vazias ("statistics",
   * "lineups"), pro ⚠ na linha da tabela. Só seção inteira vazia conta: chave
   * solta ausente pode ser estatística zerada, que o SofaScore omite.
   */
  async list() {
    const rows = await this.scannerRepository.list();
    return rows.map(({ hasStats, hasLineups, hasSampleEvent, ...row }) => ({
      ...row,
      coverageGaps: hasSampleEvent
        ? [...(hasStats ? [] : ['statistics']), ...(hasLineups ? [] : ['lineups'])]
        : [],
    }));
  }

  async sample(id: number) {
    const row = await this.scannerRepository.sample(id);
    if (!row) throw new NotFoundException('Competição não está no scanner');
    return row;
  }

  async create(dto: CreateScannerTournamentDTO) {
    try {
      return await this.scannerRepository.create({
        id: dto.id,
        name: dto.name.trim(),
        sportId: dto.sportId as SportId,
      });
    } catch (error) {
      const code = (error as { code?: string } | null)?.code;
      if (code === '23505') throw new BadRequestException(`O torneio ${dto.id} já está no scanner`);
      if (code === '23503') throw new BadRequestException('Esporte não encontrado');
      throw error;
    }
  }

  async update(id: number, dto: UpdateScannerFlagsDTO) {
    const [row] = await this.scannerRepository.update({ id }, flags(dto));
    if (!row) throw new NotFoundException('Competição não está no scanner');
    return row;
  }

  /** Ação em lote sobre as competições de hoje: o esporte não guarda configuração. */
  async updateSport(sportId: number, dto: UpdateScannerFlagsDTO) {
    const rows = await this.scannerRepository.update({ sportId: sportId as SportId }, flags(dto));
    // Cobre esporte inexistente e esporte sem competição sem consulta extra.
    if (rows.length === 0) throw new NotFoundException('Nenhuma competição desse esporte no scanner');
    return rows;
  }

  async remove(id: number) {
    if ((await this.scannerRepository.delete(id)) === 0) {
      throw new NotFoundException('Competição não está no scanner');
    }
  }
}

/** Só as flags enviadas; corpo vazio é 400 (um UPDATE sem coluna seria 500). */
function flags(dto: UpdateScannerFlagsDTO): ScannerFlags {
  const set = Object.fromEntries(Object.entries(dto).filter(([, v]) => v !== undefined)) as ScannerFlags;
  if (Object.keys(set).length === 0) throw new BadRequestException('Nada para atualizar');
  return set;
}
