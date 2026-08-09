import { Injectable, NotFoundException } from '@nestjs/common';
import { HouseRepository } from '../infra/repository/house.repository';
import { CreateHouseDto, FindAllHousesDTO } from './dto/house.dto';
import { HouseFilterRequestDto } from './dto/house.filter.dto';
import type { UserId } from '../db_types/Users';
import type { BettingHouseId } from '../db_types/BettingHouse';

@Injectable()
export class HouseService {
  constructor(private readonly houseRepository: HouseRepository) {}

  async findHouseById(id: number) {
    const house = await this.houseRepository.findById(id as BettingHouseId);
    if (!house) {
      throw new NotFoundException(`House with ID ${id} not found`);
    }
    return house;
  }

  async getAllHousesBalanceWithFilter(filter: HouseFilterRequestDto, userId: number) {
    const rows = await this.houseRepository.findAllHousesBalance(userId as UserId, filter);

    return rows.map((row) => {
      const totalDeposit = Number(row.totalDeposit);
      const totalWithdrawal = Math.abs(Number(row.totalWithdrawalRaw));
      const totalAdjustment = Number(row.totalAdjustment);
      const totalBetProfit = Number(row.totalBetProfit);
      const netTransactions = totalDeposit - totalWithdrawal + totalAdjustment;
      const realHouseBalance = netTransactions + totalBetProfit;

      return {
        houseId: row.houseId,
        houseName: row.houseName,
        totalBets: Number(row.totalBets),
        totalStake: Number(row.totalStake),
        totalBetProfit,
        totalDeposit,
        totalWithdrawal,
        totalTransactions: netTransactions,
        realHouseBalance,
        houseBalance: Math.max(0, realHouseBalance),
        pendingBets: Number(row.pendingBets),
        wonBets: Number(row.wonBets),
        lostBets: Number(row.lostBets),
        lastMovementAt: row.lastMovementAt ?? null,
      };
    });
  }

  async getHouseMetrics(userId: number, filter: HouseFilterRequestDto = {}) {
    const houses = await this.getAllHousesBalanceWithFilter(filter, userId);

    return houses.reduce(
      (acc, h) => ({
        totalBalance: acc.totalBalance + h.realHouseBalance,
        totalDeposit: acc.totalDeposit + h.totalDeposit,
        totalWithdrawal: acc.totalWithdrawal + h.totalWithdrawal,
        consolidatedProfit: acc.consolidatedProfit + h.totalBetProfit,
        negativeHouses: acc.negativeHouses + (h.realHouseBalance < 0 ? 1 : 0),
        totalHousesUsed: acc.totalHousesUsed + 1,
      }),
      {
        totalBalance: 0,
        totalDeposit: 0,
        totalWithdrawal: 0,
        consolidatedProfit: 0,
        negativeHouses: 0,
        totalHousesUsed: 0,
      },
    );
  }

  async getAllHouses(): Promise<FindAllHousesDTO[]> {
    return this.houseRepository.findAllHouses();
  }

  async getHouseRanking(userId: number, startDate?: string, endDate?: string, minBets = 20) {
    const rows = await this.houseRepository.findHouseRanking(
      userId as UserId,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );

    return rows
      .map((row) => {
        const settledBets = Number(row.settledBets);
        const wonBets = Number(row.wonBets);
        const volume = Number(row.volume);
        const profit = Number(row.profit);
        return {
          houseId: row.houseId,
          houseName: row.houseName,
          settledBets,
          wonBets,
          hitRate: settledBets > 0 ? wonBets / settledBets : 0,
          avgOdd: Number(row.avgOdd),
          avgStake: Number(row.avgStake),
          volume,
          profit,
          roi: volume > 0 ? profit / volume : 0,
        };
      })
      .filter((h) => h.settledBets >= minBets);
  }

  async createHouse(dto: CreateHouseDto) {
    return this.houseRepository.createHouse(dto.houseName);
  }
}
