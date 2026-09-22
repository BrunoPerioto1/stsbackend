import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AdminRepository } from '../infra/repository/admin.repository';
import { UsersRepository } from '../infra/repository/users.repository';
import { UpdateAdminUserDTO } from './dto/admin.dto';
import { ADMIN_ROLE_ID } from '../common/guards/admin.guard';
import type { UpdateUser, UserId } from '../db_types/Users';
import type { RoleId } from '../db_types/Roles';

// Só o começo do texto da tip: o card mostra pra você reconhecer qual é, e a
// mensagem inteira pode ter parágrafos.
const TIP_SNIPPET_LENGTH = 90;

@Injectable()
export class AdminService {
  constructor(
    private readonly adminRepository: AdminRepository,
    private readonly usersRepository: UsersRepository,
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
      text: tip.text.slice(0, TIP_SNIPPET_LENGTH),
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

    const fields: UpdateUser = {};
    if (dto.roleId !== undefined) fields.roleId = dto.roleId as RoleId;
    if (dto.unlock) {
      fields.failedLoginAttempts = 0;
      fields.lockedUntil = null;
    }
    if (dto.unlinkTelegram) {
      fields.telegramUserId = null;
      fields.telegramLinkedAt = null;
    }

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
