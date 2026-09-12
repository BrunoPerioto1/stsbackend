import { Injectable } from '@nestjs/common';
import { SportRepository } from '../infra/repository/sport.repository';
import { matchIdByName } from '../common/utils/name-match.util';
import type { SportId } from '../db_types/Sports';

@Injectable()
export class SportService {
  constructor(private readonly sportRepository: SportRepository) {}

  async getAllSports() {
    return this.sportRepository.findAllSports();
  }

  // O esporte chega como texto do parser ("Soccer", "futebol", "NFL"); aqui
  // ele vira a linha cadastrada. null quando nada bate — a aposta é criada do
  // mesmo jeito, só sem classificação, em vez de cair num "Outros" que
  // esconderia parser quebrado.
  async resolveSportId(
    sportName: string | null | undefined,
  ): Promise<SportId | null> {
    if (!sportName) return null;
    const sports = await this.getAllSports();
    const id = matchIdByName(sportName, sports);
    return id === null ? null : (id as SportId);
  }
}
