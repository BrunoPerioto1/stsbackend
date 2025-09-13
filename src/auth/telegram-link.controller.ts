import { Body, Controller, Post, Req, UseGuards, NotFoundException, BadRequestException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { v4 as uuidv4 } from 'uuid';
import { Request } from 'express';
import { UsersRepository } from '../infra/repository/users.repository';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiBody } from '@nestjs/swagger';
import { ApiProperty } from '@nestjs/swagger';

export class TelegramLinkRequest {
  @ApiProperty({
    description: 'Código de vinculação gerado',
    example: '550e8400-e29b-41d4-a716-446655440000'
  })
  code!: string;

  @ApiProperty({
    description: 'ID do usuário no Telegram',
    example: 123456789
  })
  telegramUserId!: number;
}

export class TelegramLinkResponse {
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

@ApiTags('Telegram')
@ApiBearerAuth()
@Controller('auth')
export class TelegramLinkController {
  private telegramLinkCodes = new Map<string, number>();

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
          example: '550e8400-e29b-41d4-a716-446655440000',
          description: 'Código de vinculação'
        }
      }
    }
  })
  @ApiResponse({ status: 401, description: 'Não autorizado - Token JWT inválido ou ausente' })
  @ApiBearerAuth()
  @Post('link-telegram')
  @UseGuards(AuthGuard('jwt'))
  async generateLinkCode(@Req() req: Request): Promise<{ code: string }> {
    const userId = (req.user as any).userId;
    const user = await this.usersRepository.findById(userId);
    if (!user) {
      throw new NotFoundException('Usuário não encontrado.');
    }
    const code = uuidv4();
    this.telegramLinkCodes[code] = userId;
    return { code };
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
    const userId = this.telegramLinkCodes[code];

    if (!userId) {
      throw new BadRequestException('Código inválido ou expirado.');
    }

    try {
      const existingUser = await this.usersRepository.findByTelegramUserId(telegramUserId);
      if (existingUser) {
        throw new BadRequestException('Este ID do Telegram já está vinculado a outra conta.');
      }
      await this.usersRepository.vincularTelegram(userId, telegramUserId);
      delete this.telegramLinkCodes[code];

      return {
        success: true,
        message: 'Telegram vinculado com sucesso!',
        userId,
        telegramUserId
      };
    } catch (error) {
      console.error('Erro ao vincular Telegram:', error);
      throw new BadRequestException('Erro ao vincular conta do Telegram.');
    }
  }
}