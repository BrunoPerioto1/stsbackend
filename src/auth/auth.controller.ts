import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { User } from '../common/decorators/user.decorator';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { PasswordResetService } from './password-reset.service';
import { ChangePasswordDTO, ForgotPasswordDTO, LoginDTO, ResetPasswordDTO } from './dto/login.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly passwordReset: PasswordResetService,
  ) {}

  @Post('login')
  @ApiOperation({ summary: 'Autentica um usuário e retorna o token JWT' })
  @ApiResponse({ status: 201, description: 'Login realizado com sucesso.' })
  @ApiUnauthorizedResponse({ description: 'Credenciais inválidas (mesma resposta exista ou não o e-mail).' })
  @ApiResponse({ status: 429, description: 'Conta travada por tentativas seguidas; o corpo traz `lockedUntil`.' })
  async login(@Body() loginDto: LoginDTO) {
    return this.authService.login(loginDto);
  }

  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('jwt')
  @Post('change-password')
  @ApiOperation({ summary: 'Troca a senha do usuário logado' })
  @ApiUnauthorizedResponse({ description: 'Senha atual incorreta.' })
  async changePassword(@User('userId') userId: number, @Body() dto: ChangePasswordDTO) {
    return this.authService.changePassword(userId, dto);
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Manda pelo bot do Telegram um código pra redefinir a senha',
    description: 'Responde igual exista ou não a conta: a tela não pode revelar quais e-mails estão cadastrados.',
  })
  async forgotPassword(@Body() dto: ForgotPasswordDTO) {
    await this.passwordReset.request(dto.email);
    return { sent: true };
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Troca a senha com o código recebido no bot' })
  async resetPassword(@Body() dto: ResetPasswordDTO) {
    await this.passwordReset.reset(dto.email, dto.code, dto.newPassword);
    return { success: true };
  }
}
