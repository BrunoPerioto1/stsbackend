import { Module } from '@nestjs/common';
import { DatabaseModule } from '../infra/db/db.module';
import { TipsRepository } from '../infra/repository/tips.repository';
import { TipsService } from '../tips/tips.service';

@Module({
  imports: [DatabaseModule],
  providers: [TipsRepository, TipsService],
  exports: [TipsService],
})
export class TipsModule {}
