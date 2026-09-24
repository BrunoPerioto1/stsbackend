import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UsersRepository } from '../infra/repository/users.repository';
import { UserDto } from './dto/user.dto';
import { extendAccess } from './access';
import { CreateUserRequestDTO, UpdateUserRequestDTO } from './dto/request.dto';
import { CreateUserResponseDTO } from './dto/response.dto';
import type { UserId, UpdateUser } from '../db_types/Users';
import type { RoleId } from '../db_types/Roles';

// Papel de quem se cadastra. Vem fixo do servidor: enquanto o roleId saía do
// corpo da requisição, qualquer um criava (ou promovia) a própria conta como
// admin — por isso os 12 usuários existentes estavam todos em role 1.
const DEFAULT_ROLE_ID = 3 as RoleId; // roles.name = 'user'

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  async findByEmail(email: string): Promise<UserDto | null> {
    const user = await this.usersRepository.findByEmail(email);
    return user ?? null;
  }

  // Contagem de tentativas de login. `lockedUntil` null limpa um bloqueio
  // vencido; com data, tranca a conta até lá.
  async registerFailedLogin(
    userId: number,
    attempts: number,
    lockedUntil: Date | null,
  ) {
    await this.usersRepository.updateUser(userId as UserId, {
      failedLoginAttempts: attempts,
      lockedUntil,
    });
  }

  async registerSuccessfulLogin(userId: number) {
    await this.usersRepository.updateUser(userId as UserId, {
      failedLoginAttempts: 0,
      lockedUntil: null,
      lastLogin: new Date(),
    });
  }

  // Linha crua, com passwordHash — usada por quem precisa conferir a senha
  // (troca de senha). Telas continuam usando getMe, que já vem sem o hash.
  async findById(userId: number): Promise<UserDto | null> {
    const user = await this.usersRepository.findById(userId as UserId);
    return user ?? null;
  }

  async deleteAccount(userId: number): Promise<void> {
    const user = await this.usersRepository.findById(userId as UserId);
    if (!user) throw new BadRequestException('Usuário não encontrado.');
    await this.usersRepository.deleteUserAndData(userId as UserId);
  }

  async createUser(
    params: CreateUserRequestDTO,
  ): Promise<CreateUserResponseDTO> {
    const existingEmail = await this.usersRepository.findByEmail(params.email);
    if (existingEmail) {
      throw new BadRequestException('E-mail já cadastrado');
    }

    const existingUsername = await this.usersRepository.findByUsername(
      params.username,
    );
    if (existingUsername) {
      throw new BadRequestException('Username já cadastrado');
    }

    const passwordHash = await bcrypt.hash(params.password, 10);
    const created = await this.usersRepository.insertUser({
      username: params.username,
      email: params.email,
      passwordHash,
      roleId: DEFAULT_ROLE_ID,
      fullName: params.fullName ?? null,
      // Conta nova nasce sem acesso (ou com TRIAL_DAYS de teste): libera quando o PIX cair.
      accessUntil: extendAccess(null, Number(process.env.TRIAL_DAYS ?? 0)),
    });

    const { passwordHash: _, ...safe } = created as any;
    return safe as CreateUserResponseDTO;
  }

  async getMe(userId: number): Promise<Omit<UserDto, 'passwordHash'>> {
    const user = await this.usersRepository.findById(userId as UserId);
    if (!user) throw new BadRequestException('Usuário não encontrado.');
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash, ...safe } = user as any;
    return safe;
  }

  async updateMe(
    userId: number,
    params: UpdateUserRequestDTO,
  ): Promise<Omit<UserDto, 'passwordHash'>> {
    const fields: UpdateUser = {};
    if (params.email) {
      const current = await this.usersRepository.findById(userId as UserId);
      if (current && params.email !== current.email) {
        const ok =
          !!params.currentPassword &&
          (await bcrypt.compare(params.currentPassword, current.passwordHash));
        if (!ok) throw new UnauthorizedException('Senha atual incorreta');
      }
    }
    if (params.dashboardPreferences !== undefined)
      fields.dashboardPreferences = params.dashboardPreferences;
    if (params.username) fields.username = params.username;
    if (params.email) fields.email = params.email;
    if (params.fullName !== undefined) fields.fullName = params.fullName;
    if (params.stake !== undefined) fields.stake = params.stake;
    if (params.minPercentFilter !== undefined)
      fields.minPercentFilter = params.minPercentFilter;
    if (params.staleHouseDays !== undefined)
      fields.staleHouseDays = params.staleHouseDays;

    const updated = await this.usersRepository.updateUser(
      userId as UserId,
      fields,
    );
    if (!updated) throw new BadRequestException('Erro ao atualizar usuário.');
    // eslint-disable-next-line @typescript-eslint/no-unused_vars
    const { passwordHash, ...safe } = updated as any;
    return safe;
  }
  /**
   * Confirma o código gerado no app. Só o bot chama, com o `ctx.from.id` que o
   * próprio Telegram garante — por isso não existe mais rota HTTP pra isto: ela
   * aceitava qualquer telegramUserId e deixava chutar os 10^6 códigos.
   */
  async confirmTelegramLink(code: string, telegramUserId: number, telegramUsername: string | null = null) {
    const owner = await this.usersRepository.findByTelegramLinkCode(code.trim());
    const expiresAt = owner?.telegramLinkExpiresAt ? new Date(owner.telegramLinkExpiresAt) : null;
    if (!owner || !expiresAt || expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Código inválido ou expirado.');
    }

    if (await this.usersRepository.findByTelegramUserId(telegramUserId)) {
      throw new BadRequestException('Este ID do Telegram já está vinculado a outra conta.');
    }

    await this.usersRepository.linkTelegram(owner.id, telegramUserId, telegramUsername);
  }

  async setPassword(userId: number, password: string) {
    await this.usersRepository.updateUser(userId as UserId, {
      passwordHash: await bcrypt.hash(password, 10),
    });
  }

  async vincularTelegram(userId: number, telegramUserId: number) {
    await this.usersRepository.linkTelegram(userId as UserId, telegramUserId);
  }

  async desvincularTelegram(userId: number) {
    await this.usersRepository.updateUser(userId as UserId, {
      telegramUserId: null,
      telegramLinkedAt: null,
      telegramUsername: null,
    });
  }

  // Tipo de retorno estendido com telegramUserId/minPercentFilter — a linha
  // de base do UserDto (usado como resposta pública em /users/me) não
  // declara esses campos, mas quem chama esse método específico (telegram
  // service) precisa deles pra montar o fan-out de tips.
  async findByTelegramUserId(telegramUserId: number): Promise<
    | (UserDto & {
        telegramUserId: number | null;
        minPercentFilter: number | null;
      })
    | null
  > {
    const user =
      await this.usersRepository.findByTelegramUserId(telegramUserId);
    return user ?? null;
  }

  async updateUserStake(userId: number, stake: number): Promise<boolean> {
    if (!Number.isFinite(stake) || stake <= 0) {
      throw new Error('Valor da stake deve ser maior que zero');
    }
    return this.usersRepository.updateUserStake(userId as UserId, stake);
  }

  async getUserStake(userId: number): Promise<number> {
    const stake = await this.usersRepository.getUserStake(userId as UserId);
    return stake ?? 2000; // Retorna 2000 como valor padrão se não encontrar
  }

  async getUsersForTipsFanout() {
    return this.usersRepository.findLinkedForTipsFanout();
  }

  async syncTelegramUsername(telegramUserId: number, telegramUsername: string | null) {
    await this.usersRepository.syncTelegramUsername(telegramUserId, telegramUsername);
  }

  async setMinPercentFilter(
    telegramUserId: number,
    value: number | null,
  ): Promise<boolean> {
    if (value !== null && (!Number.isFinite(value) || value < 0)) {
      throw new Error('Filtro de porcentagem inválido.');
    }
    return this.usersRepository.updateMinPercentFilter(telegramUserId, value);
  }
}
