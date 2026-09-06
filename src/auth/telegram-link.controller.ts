import { Body, Controller, Post, Req, UseGuards, NotFoundException, BadRequestException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { randomInt } from 'crypto';
import { Request } from 'express';
import { UsersRepository } from '../infra/repository/users.repository';
import type { UserId } from '../db_types/Users';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiBody } from '@nestjs/swagger';
import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsString } from 'class-validator';

class TelegramLinkRequest {
  @ApiProperty({
    description: 'Código de vinculação gerado',
    example: '481906'
  })
  @IsString()
  @IsNotEmpty()
  code!: string;

  @ApiProperty({
    description: 'ID do usuário no Telegram',
    example: 123456789
  })
  @IsInt()
  telegramUserId!: number;
}

class TelegramLinkResponse {
  @ApiProperty({
    description: 'Indica se a operação foi bem sucedida'
  })
  success!: boolean;

  @ApiProperty({
    description: 'Mensagem descritiva do resultado'
  })
  message!: string;

  @ApiProperty({
    description: 'ID do usuário no sistema',
    required: false
  })
  userId?: number;

  @ApiProperty({
    description: 'ID do usuário no Telegram',
    required: false
  })
  telegramUserId?: number;
}

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
  async generateLinkCode(@Req() req: Request): Promise<{ code: string; expiresAt: string }> {
    const userId = (req.user as any).userId as UserId;
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

  @ApiOperation({ summary: 'Confirma a vinculação de uma conta do Telegram' })
  @ApiResponse({
    status: 201,
    description: 'Vinculação realizada com sucesso',
    type: TelegramLinkResponse
  })
  @ApiResponse({ status: 400, description: 'Código inválido ou conta já vinculada' })
  @ApiBody({ type: TelegramLinkRequest })
  @Post('link-telegram/confirm')
  async confirmLink(@Body() body: TelegramLinkRequest): Promise<TelegramLinkResponse> {
    const { code, telegramUserId } = body;
    const owner = await this.usersRepository.findByTelegramLinkCode(code.trim());

    const expiresAt = owner?.telegramLinkExpiresAt ? new Date(owner.telegramLinkExpiresAt) : null;
    if (!owner || !expiresAt || expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Código inválido ou expirado.');
    }

    const existingUser = await this.usersRepository.findByTelegramUserId(telegramUserId);
    if (existingUser) {
      throw new BadRequestException('Este ID do Telegram já está vinculado a outra conta.');
    }

    await this.usersRepository.linkTelegram(owner.id, telegramUserId);

    return {
      success: true,
      message: 'Telegram vinculado com sucesso!',
      userId: owner.id,
      telegramUserId,
    };
  }
}