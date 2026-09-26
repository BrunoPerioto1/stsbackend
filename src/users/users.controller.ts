import { Body, Controller, Delete, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { User } from '../common/decorators/user.decorator';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserRequestDTO, DeleteAccountRequestDTO, UpdateUserRequestDTO } from './dto/request.dto';
import { CreateUserResponseDTO } from './dto/response.dto';
import { AuthGuard } from '@nestjs/passport';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @ApiOperation({ summary: 'Criar usuário' })
  @ApiResponse({ status: 201, type: CreateUserResponseDTO })
  async create(@Body() dto: CreateUserRequestDTO) {
    return this.usersService.createUser(dto);
  }


  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('jwt')
  @Get('me')
  @ApiOperation({ summary: 'Obter usuário logado' })
  async me(@User('userId') userId: number) {
    return this.usersService.getMe(userId);
  }


  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('jwt')
  @Patch('me')
  @ApiOperation({ summary: 'Atualizar usuário logado' })
  async update(@User('userId') userId: number, @Body() dto: UpdateUserRequestDTO) {
    return this.usersService.updateMe(userId, dto);
  }

  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('jwt')
  @Delete('me')
  @ApiOperation({ summary: 'Exclui a conta logada e todos os seus dados (pede a senha)' })
  async deleteMe(@User('userId') userId: number, @Body() dto: DeleteAccountRequestDTO) {
    await this.usersService.deleteAccount(userId, dto.password);
    return { success: true };
  }

  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('jwt')
  @Delete('me/telegram')
  @ApiOperation({ summary: 'Desvincula a conta do Telegram do usuário logado' })
  async unlinkTelegram(@User('userId') userId: number) {
    await this.usersService.desvincularTelegram(userId);
    return { success: true };
  }
}


