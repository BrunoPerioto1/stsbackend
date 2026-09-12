import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SportService } from './sport.service';
import { SportDto } from './dto/sport.dto';

@ApiTags('Esportes')
@Controller('sports')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth()
export class SportController {
  constructor(private readonly sportService: SportService) {}

  @Get()
  @ApiOperation({ summary: 'Lista os esportes cadastrados (catálogo dos filtros)' })
  @ApiResponse({ status: 200, type: [SportDto] })
  findAll() {
    return this.sportService.getAllSports();
  }
}
