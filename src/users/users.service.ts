
import { BadRequestException, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UsersRepository } from '../infra/repository/users.repository';
import { UserDto } from './dto/user.dto';
import { CreateUserRequestDTO, UpdateUserRequestDTO } from './dto/request.dto';
import { CreateUserResponseDTO } from './dto/response.dto';
import type { UserId } from '../db_types/Users';
import type { RoleId } from '../db_types/Roles';

@Injectable()
export class UsersService {
    constructor(private readonly usersRepository: UsersRepository) {}

    async findByEmail(email: string): Promise<UserDto | null> {
        const user = await this.usersRepository.findByEmail(email);
        return user ?? null;
    }

    // Contagem de tentativas de login. `lockedUntil` null limpa um bloqueio
    // vencido; com data, tranca a conta até lá.
    async registerFailedLogin(userId: number, attempts: number, lockedUntil: Date | null) {
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

    async createUser(params: CreateUserRequestDTO): Promise<CreateUserResponseDTO> {
        const existingEmail = await this.usersRepository.findByEmail(params.email);
        if (existingEmail) {
            throw new BadRequestException('E-mail já cadastrado');
        }

        const existingUsername = await this.usersRepository.findByUsername(params.username);
        if (existingUsername) {
            throw new BadRequestException('Username já cadastrado');
        }

        const passwordHash = await bcrypt.hash(params.password, 10);
        const created = await this.usersRepository.insertUser({
            username: params.username,
            email: params.email,
            passwordHash,
            roleId: params.roleId as RoleId,
            fullName: params.fullName ?? null,
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

    async updateMe(userId: number, params: UpdateUserRequestDTO): Promise<Omit<UserDto, 'passwordHash'>> {
        const fields: any = {};
        if (params.username) fields.username = params.username;
        if (params.email) fields.email = params.email;
        if (params.fullName !== undefined) fields.fullName = params.fullName;
        if (params.roleId !== undefined) fields.roleId = params.roleId as RoleId;
        if (params.password) fields.passwordHash = await bcrypt.hash(params.password, 10);
        if (params.stake !== undefined) fields.stake = params.stake;
        if (params.minPercentFilter !== undefined) fields.minPercentFilter = params.minPercentFilter;

        const updated = await this.usersRepository.updateUser(userId as UserId, fields);
        if (!updated) throw new BadRequestException('Erro ao atualizar usuário.');
        // eslint-disable-next-line @typescript-eslint/no-unused_vars
        const { passwordHash, ...safe } = updated as any;
        return safe;
    }
      async vincularTelegram(userId: number, telegramUserId: number) {
        await this.usersRepository.linkTelegram(userId as UserId, telegramUserId);
    }

    async desvincularTelegram(userId: number) {
        await this.usersRepository.updateUser(userId as UserId, {
            telegramUserId: null,
            telegramLinkedAt: null,
        });
    }

    // Tipo de retorno estendido com telegramUserId/minPercentFilter — a linha
    // de base do UserDto (usado como resposta pública em /users/me) não
    // declara esses campos, mas quem chama esse método específico (telegram
    // service) precisa deles pra montar o fan-out de tips.
    async findByTelegramUserId(
        telegramUserId: number,
    ): Promise<(UserDto & { telegramUserId: number | null; minPercentFilter: number | null }) | null> {
        const user = await this.usersRepository.findByTelegramUserId(telegramUserId);
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

    async setMinPercentFilter(telegramUserId: number, value: number | null): Promise<boolean> {
        if (value !== null && (!Number.isFinite(value) || value < 0)) {
            throw new Error('Filtro de porcentagem inválido.');
        }
        return this.usersRepository.updateMinPercentFilter(telegramUserId, value);
    }
}


