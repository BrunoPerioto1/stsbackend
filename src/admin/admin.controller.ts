import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { AdminService } from './admin.service';
import { CreateAdminHouseDTO, UpdateAdminHouseDTO, UpdateAdminUserDTO } from './dto/admin.dto';
import { AdminGuard } from '../common/guards/admin.guard';
import { User } from '../common/decorators/user.decorator';

@ApiTags('admin')
@Controller('admin')
// Os dois guards no controller inteiro: não existe rota daqui que um não-admin
// possa ver. Decorar por método seria uma chance a mais de esquecer.
@UseGuards(AuthGuard('jwt'), AdminGuard)
@ApiBearerAuth('jwt')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Saúde do pipeline: Telegram → tip → fan-out → coletor → liquidação' })
  @ApiResponse({ status: 200, description: 'Estado atual de cada etapa.' })
  overview(@User('userId') userId: number) {
    return this.adminService.overview(userId);
  }

  @Get('users')
  @ApiOperation({ summary: 'Lista todos os usuários com papel, bloqueio e contagem de apostas' })
  listUsers() {
    return this.adminService.listUsers();
  }

  @Get('houses')
  @ApiOperation({ summary: 'Casas de aposta com apelidos e contagem de apostas (inclui inativas)' })
  listHouses() {
    return this.adminService.listHouses();
  }

  @Post('houses')
  @ApiOperation({ summary: 'Cadastra uma casa de aposta com seus apelidos' })
  createHouse(@Body() dto: CreateAdminHouseDTO) {
    return this.adminService.createHouse(dto);
  }

  @Patch('houses/:id')
  @ApiOperation({ summary: 'Renomeia, troca apelidos ou (des)ativa uma casa' })
  updateHouse(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateAdminHouseDTO) {
    return this.adminService.updateHouse(id, dto);
  }

  @Patch('users/:id')
  @ApiOperation({ summary: 'Muda papel, desbloqueia ou desvincula o Telegram de um usuário' })
  updateUser(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAdminUserDTO,
    @User('userId') requesterId: number,
  ) {
    return this.adminService.updateUser(requesterId, id, dto);
  }
}
