// src/dashboard/dashboard.module.ts
import { Module } from '@nestjs/common';
import { DashboardController } from '../dashboard/dashboard.controller';
import { DashboardService } from '../dashboard/dashboard.service';
import { DashboardRepository } from '../infra/repository/dashboard.repository';
import { DatabaseModule } from '../infra/db/db.module';

@Module({
  imports: [DatabaseModule],
  controllers: [DashboardController],
  providers: [
    DashboardService,
    DashboardRepository, 
  ],
  exports: [DashboardService],
})
export class DashboardModule {}