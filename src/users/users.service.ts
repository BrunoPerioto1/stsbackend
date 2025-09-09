import { BadRequestException, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UsersRepository, UserRecord } from './users.repository';
import { CreateUserRequestDTO, UpdateUserRequestDTO } from './dto/request.dto';
import { CreateUserResponseDTO } from './dto/response.dto';

@Injectable()
export class UsersService {
    constructor(private readonly usersRepository: UsersRepository) {}

    async findByEmail(email: string): Promise<UserRecord | null> {
        return this.usersRepository.findByEmail(email);
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

        const password_hash = await bcrypt.hash(params.password, 10);
        const created = await this.usersRepository.insertUser({
            username: params.username,
            email: params.email,
            password_hash,
            role_id: params.roleId,
            full_name: params.full_name ?? null,
        });

        const { password_hash: _, ...safe } = created as any;
        return safe as CreateUserResponseDTO;
    }

    async getMe(userId: number): Promise<Omit<UserRecord, 'password_hash'>> {
        const user = await this.usersRepository.findById(userId);
        if (!user) throw new BadRequestException('Usuário não encontrado.');
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { password_hash, ...safe } = user as any;
        return safe;
    }

    async updateMe(userId: number, params: UpdateUserRequestDTO): Promise<Omit<UserRecord, 'password_hash'>> {
        const fields: any = {};
        if (params.username) fields.username = params.username;
        if (params.email) fields.email = params.email;
        if (params.full_name !== undefined) fields.full_name = params.full_name;
        if (params.roleId !== undefined) fields.role_id = params.roleId;
        if (params.password) fields.password_hash = await bcrypt.hash(params.password, 10);

        const updated = await this.usersRepository.updateUser(userId, fields);
        if (!updated) throw new BadRequestException('Erro ao atualizar usuário.');
        // eslint-disable-next-line @typescript-eslint/no-unused_vars
        const { password_hash, ...safe } = updated as any;
        return safe;
    }
}


