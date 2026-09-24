import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AdminRepository } from '../infra/repository/admin.repository';
import { UsersRepository } from '../infra/repository/users.repository';
import { HouseRepository } from '../infra/repository/house.repository';
import { CreateAdminHouseDTO, UpdateAdminHouseDTO, UpdateAdminUserDTO } from './dto/admin.dto';
import { normalizeName } from '../common/utils/bet.utils';
import { normalizeFederalHouseUrl } from '../common/utils/house-url.util';
import type { BettingHouseId } from '../db_types/BettingHouse';
import { ADMIN_ROLE_ID } from '../common/guards/admin.guard';
import type { UpdateUser, UserId } from '../db_types/Users';
import type { RoleId } from '../db_types/Roles';
import { extendAccess } from '../users/access';

type AdminHouseRow = Awaited<ReturnType<HouseRepository['findAllHousesForAdmin']>>[number];

@Injectable()
export class AdminService {
  constructor(
    private readonly adminRepository: AdminRepository,
    private readonly usersRepository: UsersRepository,
    private readonly houseRepository: HouseRepository,
  ) {}

  async overview(userId: number) {
    const { deliveryFilters, ...data } = await this.adminRepository.overview(userId as UserId);

    /**
     * Tip que passaria pelo filtro de pelo menos um usuário vinculado e mesmo
     * assim não gerou DM. É a única linha da lista que merece cor: as outras
     * são o filtro de % funcionando.
     *
     * Ainda pode dar falso positivo — o fan-out também pula quem saiu do grupo
     * de Tips, e isso só o Telegram sabe. Por isso o card mostra a lista, não
     * um alarme.
     */
    const expected = (percent: number | null) =>
      deliveryFilters.some((f) => f === null || percent === null || Number(percent) >= f);

    const undeliveredTips = data.undeliveredTips.map((tip) => ({
      id: Number(tip.id),
      createdAt: tip.createdAt,
      percent: tip.percent === null ? null : Number(tip.percent),
      // Texto inteiro: quem lê isso é a tela /admin/tips, onde a mensagem é o
      // conteúdo. Cortada, não dava pra saber de que aposta se tratava.
      text: tip.text,
      expectedDelivery: expected(tip.percent),
    }));

    return {
      ...data,
      undeliveredTips,
      undeliveredExpected: undeliveredTips.filter((t) => t.expectedDelivery).length,
    };
  }

  async listUsers() {
    const rows = await this.adminRepository.listUsers();

    return rows.map(({ telegramUserId, betCount, ...user }) => ({
      ...user,
      // O ID do Telegram não tem uso na tela e é dado de outra plataforma:
      // sai só o fato de existir vínculo.
      hasTelegram: telegramUserId !== null,
      betCount: Number(betCount),
    }));
  }

  async listHouses() {
    const rows = await this.houseRepository.findAllHousesForAdmin();
    return rows.map((house) => ({ ...house, betCount: Number(house.betCount) }));
  }

  /**
   * Casa nova. O nome é conferido contra os existentes com a mesma
   * normalização que o casamento de tips usa (`normalizeName`): sem isso
   * "Bet 365" entra como casa separada de "Bet365" e as apostas se dividem
   * entre as duas sem ninguém perceber.
   */
  async createHouse(dto: CreateAdminHouseDTO) {
    const houses = await this.houseRepository.findAllHousesForAdmin();
    const name = dto.name.trim();

    this.assertNameIsFree(houses, name);
    const aliases = this.normalizeAliases(dto.aliases ?? [], name, houses, null);
    const websiteUrl = normalizeFederalHouseUrl(dto.websiteUrl);

    const created = await this.houseRepository.createHouse(name, aliases, websiteUrl);
    return { ...created, betCount: 0 };
  }

  async updateHouse(id: number, dto: UpdateAdminHouseDTO) {
    const houses = await this.houseRepository.findAllHousesForAdmin();
    const current = houses.find((h) => Number(h.id) === id);
    if (!current) throw new NotFoundException('Casa não encontrada');

    const update: { name?: string; aliases?: string[]; isActive?: boolean; websiteUrl?: string | null } = {};

    if (dto.name !== undefined) {
      const name = dto.name.trim();
      this.assertNameIsFree(houses, name, id);
      update.name = name;
    }

    if (dto.aliases !== undefined) {
      update.aliases = this.normalizeAliases(dto.aliases, update.name ?? current.name, houses, id);
    }

    if (dto.isActive !== undefined) update.isActive = dto.isActive;
    if (dto.websiteUrl !== undefined) update.websiteUrl = normalizeFederalHouseUrl(dto.websiteUrl);

    if (Object.keys(update).length === 0) {
      throw new BadRequestException('Nada para atualizar');
    }

    const updated = await this.houseRepository.updateHouse(id as BettingHouseId, update);
    if (!updated) throw new NotFoundException('Casa não encontrada');
    return { ...updated, betCount: Number(current.betCount) };
  }

  private assertNameIsFree(houses: AdminHouseRow[], name: string, ignoreId: number | null = null) {
    const normalized = normalizeName(name);
    const clash = houses.find((h) => Number(h.id) !== ignoreId && normalizeName(h.name) === normalized);
    if (clash) {
      throw new BadRequestException(`"${clash.name}" já é a mesma casa com outra grafia`);
    }
  }

  /**
   * Apelido só serve se for único: `matchHouseIdByName` devolve a primeira casa
   * cujo apelido bate, então o mesmo apelido em duas casas faria a tip cair na
   * que aparecer primeiro — silenciosamente, e mudando conforme a ordenação.
   * Apelido igual ao nome da própria casa é redundante e sai fora.
   */
  private normalizeAliases(
    aliases: string[],
    ownName: string,
    houses: AdminHouseRow[],
    ignoreId: number | null,
  ): string[] {
    const seen = new Set<string>([normalizeName(ownName)]);
    const result: string[] = [];

    for (const raw of aliases) {
      const alias = raw.trim();
      const normalized = normalizeName(alias);
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);

      const clash = houses.find(
        (h) =>
          Number(h.id) !== ignoreId &&
          (normalizeName(h.name) === normalized ||
            (h.aliases ?? []).some((a) => normalizeName(a) === normalized)),
      );
      if (clash) {
        throw new BadRequestException(`O apelido "${alias}" já aponta para "${clash.name}"`);
      }

      result.push(alias);
    }

    return result;
  }

  /**
   * Mudanças administrativas numa conta alheia. `requesterId` existe pra uma
   * regra só: o admin não se rebaixa. Sem ela, um clique na própria linha
   * tranca o dono do lado de fora da tela — e não sobra nenhum caminho pela
   * aplicação pra desfazer, só o banco.
   */
  async updateUser(requesterId: number, targetId: number, dto: UpdateAdminUserDTO) {
    const target = await this.usersRepository.findById(targetId as UserId);
    if (!target) throw new NotFoundException('Usuário não encontrado');

    if (
      dto.roleId !== undefined &&
      dto.roleId !== ADMIN_ROLE_ID &&
      requesterId === targetId
    ) {
      throw new BadRequestException('Você não pode alterar o próprio papel');
    }
    // Mesmo motivo: um prazo na própria conta tranca o admin quando vencer.
    if (dto.extendDays && requesterId === targetId) {
      throw new BadRequestException('Sua conta não tem vencimento');
    }

    const fields: UpdateUser = {};
    if (dto.roleId !== undefined) fields.roleId = dto.roleId as RoleId;
    if (dto.unlock) {
      fields.failedLoginAttempts = 0;
      fields.lockedUntil = null;
    }
    if (dto.unlinkTelegram) {
      fields.telegramUserId = null;
      fields.telegramLinkedAt = null;
      fields.telegramUsername = null;
    }
    if (dto.extendDays) fields.accessUntil = extendAccess(target.accessUntil, dto.extendDays);

    if (Object.keys(fields).length === 0) {
      throw new BadRequestException('Nada para atualizar');
    }

    await this.usersRepository.updateUser(targetId as UserId, fields);

    // A linha volta pela mesma consulta da lista (com contagem de apostas e sem
    // hash), pra tela poder trocar a linha no lugar em vez de refazer o GET.
    const users = await this.listUsers();
    const updated = users.find((u) => Number(u.id) === targetId);
    if (!updated) throw new NotFoundException('Usuário não encontrado');
    return updated;
  }
}
