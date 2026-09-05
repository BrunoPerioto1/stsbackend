import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { ChangePasswordDTO, LoginDTO } from './dto/login.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @ApiOperation({ summary: 'Autentica um usuário e retorna o token JWT' })
  @ApiResponse({ status: 201, description: 'Login realizado com sucesso.' })
  @ApiUnauthorizedResponse({ description: 'Credenciais inválidas. O corpo traz `attemptsLeft` quando a conta existe.' })
  @ApiResponse({ status: 429, description: 'Conta travada por tentativas seguidas; o corpo traz `lockedUntil`.' })
  async login(@Body() loginDto: LoginDTO) {
    return this.authService.login(loginDto);
  }

  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('jwt')
  @Post('change-password')
  @ApiOperation({ summary: 'Troca a senha do usuário logado' })
  @ApiUnauthorizedResponse({ description: 'Senha atual incorreta.' })
  async changePassword(@Req() req: any, @Body() dto: ChangePasswordDTO) {
    return this.authService.changePassword(req.user.userId, dto);
  }
}
