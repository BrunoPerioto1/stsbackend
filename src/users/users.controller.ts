import { Body, Controller, Get, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserRequestDTO, UpdateUserRequestDTO } from './dto/request.dto';
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
  async me(@Req() req: any) {
    return this.usersService.getMe(req.user.userId);
  }

  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('jwt')
  @Patch('me')
  @ApiOperation({ summary: 'Atualizar usuário logado' })
  async update(@Req() req: any, @Body() dto: UpdateUserRequestDTO) {
    return this.usersService.updateMe(req.user.userId, dto);
  }
}


