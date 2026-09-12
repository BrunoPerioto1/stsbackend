import { Module } from '@nestjs/common';
import { SportController } from '../sport/sport.controller';
import { SportService } from '../sport/sport.service';
import { SportRepository } from '../infra/repository/sport.repository';

@Module({
  controllers: [SportController],
  providers: [SportService, SportRepository],
  exports: [SportService],
})
export class SportModule {}
