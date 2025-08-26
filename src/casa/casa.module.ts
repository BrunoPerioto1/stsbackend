import { Module } from '@nestjs/common';
import { CasaService } from './casa.service';
import { CasaController } from './casa.controller';

@Module({
  controllers: [CasaController],
  providers: [CasaService],
  exports: [CasaService],
})
export class CasaModule {}