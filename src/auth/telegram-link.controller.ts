import { Controller, Post, UseGuards, NotFoundException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { randomInt } from 'crypto';
import { User } from '../common/decorators/user.decorator';
import { UsersRepository } from '../infra/repository/users.repository';
import type { UserId } from '../db_types/Users';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';

// O código vale por cinco minutos — tempo de abrir o Telegram e colar a linha,
// não de deixar aberto num navegador emprestado.
const LINK_CODE_TTL_MINUTES = 5;

@ApiTags('Telegram')
@ApiBearerAuth()
@Controller('auth')
export class TelegramLinkController {
  constructor(private readonly usersRepository: UsersRepository) {}

  @ApiOperation({ summary: 'Gera um código para vincular conta do Telegram' })
  @ApiResponse({
    status: 201,
    description: 'Código gerado com sucesso',
    schema: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          example: '481906',
          description: 'Código de vinculação de seis dígitos'
        },
        expiresAt: {
          type: 'string',
          description: 'Instante em que o código deixa de valer (ISO)'
        }
      }
    }
  })
  @ApiResponse({ status: 401, description: 'Não autorizado - Token JWT inválido ou ausente' })
  @ApiBearerAuth()
  @Post('link-telegram')
  @UseGuards(AuthGuard('jwt'))
  async generateLinkCode(@User('userId') id: number): Promise<{ code: string; expiresAt: string }> {
    const userId = id as UserId;
    const user = await this.usersRepository.findById(userId);
    if (!user) {
      throw new NotFoundException('Usuário não encontrado.');
    }

    // Seis dígitos, `randomInt` e não `Math.random`: é credencial, ainda que de
    // vida curta. Gravado na linha do usuário porque quem confirma é o bot,
    // numa segunda requisição que cai noutra instância serverless — o mapa em
    // memória de antes nunca tinha o código nessa hora.
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const expiresAt = new Date(Date.now() + LINK_CODE_TTL_MINUTES * 60_000);

    await this.usersRepository.updateUser(userId, {
      telegramLinkCode: code,
      telegramLinkExpiresAt: expiresAt,
    });

    return { code, expiresAt: expiresAt.toISOString() };
  }
}
