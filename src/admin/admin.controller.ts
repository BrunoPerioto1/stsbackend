import { Body, Controller, Get, Param, ParseIntPipe, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { AdminService } from './admin.service';
import { UpdateAdminUserDTO } from './dto/admin.dto';
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
