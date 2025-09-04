import { Module } from '@nestjs/common';
import { HouseService } from '../house/house.service';
import { HouseController } from '../house/house.controller';
import { HouseRepository } from '../infra/repository/house.repository';

@Module({
  controllers: [HouseController],
  providers: [HouseService, HouseRepository],
  exports: [HouseService],
})
export class HouseModule {}
