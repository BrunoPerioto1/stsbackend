import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateHouseDto } from '../infra/dto/new-house.dto';
import { UpdateHouseDto } from '../infra/dto/update-house.dto';
import { CreateTransacaoDto } from '../infra/dto/new-transation.dto';
import { HouseRepository, HouseBalance } from '../infra/repository/house.repository';

@Injectable()
export class HouseService {
  constructor(private readonly houseRepository: HouseRepository) {}

  async createHouse(createHouseDto: CreateHouseDto) {
    return this.houseRepository.create(createHouseDto);
  }

  async findAllHouses() {
    return this.houseRepository.findAll();
  }

  async findHouseById(id: number) {
    const house = await this.houseRepository.findById(id);
    if (!house) {
      throw new NotFoundException(`House with ID ${id} not found`);
    }
    return house;
  }

  async findHouseBySlug(slug: string) {
    const house = await this.houseRepository.findBySlug(slug);
    if (!house) {
      throw new NotFoundException(`House with slug ${slug} not found`);
    }
    return house;
  }

  async updateHouse(id: number, updateHouseDto: UpdateHouseDto) {
    const updated = await this.houseRepository.update(id, updateHouseDto);
    if (!updated) {
      throw new NotFoundException(`House with ID ${id} not found`);
    }
    return updated;
  }

  async deleteHouse(id: number) {
    const deleted = await this.houseRepository.delete(id);
    if (!deleted) {
      throw new NotFoundException(`House with ID ${id} not found`);
    }
    return { success: true, message: `House ${id} deleted successfully` };
  }

  async resolveHouseByText(text: string): Promise<number | null> {
    // First try exact match by slug
    const exactHouse = await this.houseRepository.findBySlug(text);
    if (exactHouse) return exactHouse.id;

    // Then try fuzzy match by name
    const fuzzyHouse = await this.houseRepository.findByNameOrSlug(text);
    return fuzzyHouse?.id || null;
  }

  async calculateHouseBalance(houseId: number): Promise<HouseBalance> {
    const balance = await this.houseRepository.calculateHouseBalance(houseId);
    if (!balance) {
      throw new NotFoundException(`House with ID ${houseId} not found`);
    }
    return balance;
  }

  async calculateAllHousesBalance(): Promise<HouseBalance[]> {
    return this.houseRepository.calculateAllHousesBalance();
  }

  async createTransaction(createTransactionDto: CreateTransacaoDto) {
    // Validate if house exists
    const house = await this.houseRepository.findById(createTransactionDto.casa_id);
    if (!house) {
      throw new NotFoundException(`House with ID ${createTransactionDto.casa_id} not found`);
    }

    return this.houseRepository.createTransaction(createTransactionDto);
  }

  async findTransactionsByHouse(houseId: number) {
    // Validate if house exists
    const house = await this.houseRepository.findById(houseId);
    if (!house) {
      throw new NotFoundException(`House with ID ${houseId} not found`);
    }

    return this.houseRepository.findTransactionsByHouse(houseId);
  }

  async findAllTransactions() {
    return this.houseRepository.findAllTransactions();
  }

  async findHouseHistory(houseId: number) {
    // Validate if house exists
    const house = await this.houseRepository.findById(houseId);
    if (!house) {
      throw new NotFoundException(`House with ID ${houseId} not found`);
    }

    return this.houseRepository.findHouseHistory(houseId);
  }
}