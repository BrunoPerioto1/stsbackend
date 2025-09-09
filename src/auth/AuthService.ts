import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { LoginDTO } from './dto/login.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
    constructor(
        private readonly usersService: UsersService,
        private readonly jwtService: JwtService,
    ) { }

    async validateUser(email: string, pass: string): Promise<any> {
        const user = await this.usersService.findByEmail(email);
        if (!user) return null;

        const isMatch = await bcrypt.compare(pass, user.password_hash);
        if (!isMatch) return null;

        const { password_hash, ...result } = user;
        return result;
    }

    async login(loginDTO: LoginDTO) {
        const user = await this.validateUser(loginDTO.email, loginDTO.password);
        if (!user) {
            throw new UnauthorizedException('Credenciais inválidas');
        }

        const payload = {
            name: user.name,
            email: user.email,
            userId: user.id,
        };

        return {
            access_token: this.jwtService.sign(payload),
        };
    }

    async logout(user: any) {
        return { message: `Logout realizado com sucesso para ${user.email}` };
    }
}


