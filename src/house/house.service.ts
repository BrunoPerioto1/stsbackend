import { Injectable, NotFoundException } from '@nestjs/common';
import { HouseRepository, HouseBalance } from '../infra/repository/house.repository';
import { HouseDto, FindAllHousesDTO } from 'src/house/dto/house.dto';
import { HouseFilterDto } from './dto/house.filter.dto';

@Injectable()
export class HouseService {
  constructor(private readonly houseRepository: HouseRepository) {}

  
  async getHouseMetrics(userId: number): Promise<HouseDto> {
    return this.houseRepository.findHouseMetrics(userId);
  }


  async findHouseById(id: number) {
    const house = await this.houseRepository.findById(id);
    if (!house) {
      throw new NotFoundException(`House with ID ${id} not found`);
    }
    return house;
  }
  
  async getAllHousesBalanceWithFilter(filter: HouseFilterDto, userId: number) {
    return this.houseRepository.getAllHousesBalanceWithCalculations(filter, userId);
  }
 
async getAllHouses(): Promise<FindAllHousesDTO[]> {
  return this.houseRepository.findallHouses();
  
} }