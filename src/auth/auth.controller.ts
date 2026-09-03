import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDTO } from './dto/login.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @ApiOperation({ summary: 'Autentica um usuário e retorna o token JWT' })
  @ApiResponse({ status: 201, description: 'Login realizado com sucesso.' })
  @ApiUnauthorizedResponse({ description: 'Credenciais inválidas.' })
  async login(@Body() loginDto: LoginDTO) {
    return this.authService.login(loginDto);
  }
}
