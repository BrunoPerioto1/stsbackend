import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateHouseDto } from './dto/house.dto';
import { UpdateHouseDto } from './dto/house.dto';
import { HouseRepository, HouseBalance } from '../infra/repository/house.repository';
import { HouseDto } from 'src/house/dto/house.dto';

@Injectable()
export class HouseService {
  constructor(private readonly houseRepository: HouseRepository) {}

  
  async getHouseMetrics(): Promise<HouseDto> {
    return this.houseRepository.findHouseMetrics();
  }


  async findHouseById(id: number) {
    const house = await this.houseRepository.findById(id);
    if (!house) {
      throw new NotFoundException(`House with ID ${id} not found`);
    }
    return house;
  }




  async calculateHouseBalance(houseId: number): Promise<HouseBalance> {
    const [betsResult, transactionsResult] = await Promise.all([
      this.houseRepository.getBetsData(houseId),
      this.houseRepository.getTransactionsData(houseId)
    ]);

    if (betsResult.length === 0) {
      throw new NotFoundException(`House with ID ${houseId} not found or has no bets`);
    }

    const betsData = betsResult[0];
    const totalTransactions = transactionsResult.length > 0 ? transactionsResult[0].total_transactions : 0;
    const realHouseBalance = Number(betsData.total_return) + Number(totalTransactions);
    
    // house_balance nunca pode ser negativo, mostra 0 se for negativo
    const houseBalance = Math.max(0, realHouseBalance);

    return {
      house_id: Number(betsData.house_id),
      house_name: betsData.house_name,
      total_bets: Number(betsData.total_bets),
      total_stake: Number(betsData.total_stake),
      total_bet_profit: Number(betsData.total_bet_profit),
      total_transactions: Number(totalTransactions),
      house_balance: houseBalance,
      real_house_balance: realHouseBalance,
      pending_bets: Number(betsData.pending_bets),
      won_bets: Number(betsData.won_bets),
      lost_bets: Number(betsData.lost_bets)
    };
  }

  async calculateAllHousesBalance(): Promise<HouseBalance[]> {
    const [betsResult, transactionsResult] = await Promise.all([
      this.houseRepository.getBetsData(),
      this.houseRepository.getTransactionsData()
    ]);

    const transactionsMap = new Map();
    transactionsResult.forEach(row => {
      transactionsMap.set(row.house_id, row.total_transactions);
    });

    // Combinar os resultados
    return betsResult.map(betsData => {
      const totalTransactions = transactionsMap.get(betsData.house_id) || 0;
      const realHouseBalance = Number(betsData.total_return) + Number(totalTransactions);
      
      // house_balance nunca pode ser negativo, mostra 0 se for negativo
      const houseBalance = Math.max(0, realHouseBalance);

      return {
        house_id: Number(betsData.house_id),
        house_name: betsData.house_name,
        total_bets: Number(betsData.total_bets),
        total_stake: Number(betsData.total_stake),
        total_bet_profit: Number(betsData.total_bet_profit),
        total_transactions: Number(totalTransactions),
        house_balance: houseBalance,
        real_house_balance: realHouseBalance,
        pending_bets: Number(betsData.pending_bets),
        won_bets: Number(betsData.won_bets),
        lost_bets: Number(betsData.lost_bets)
      };
    });
  }


  async findTransactionsByHouse(houseId: number) {
    const house = await this.houseRepository.findById(houseId);
    if (!house) {
      throw new NotFoundException(`House with ID ${houseId} not found`);
    }

    return this.houseRepository.findTransactionsByHouse(houseId);
  }


  async findHouseHistory(houseId: number) {
    const house = await this.houseRepository.findById(houseId);
    if (!house) {
      throw new NotFoundException(`House with ID ${houseId} not found`);
    }

    // Buscar apostas e transações separadamente
    const [bets, transactions] = await Promise.all([
      this.houseRepository.findHouseBets(houseId),
      this.houseRepository.findHouseTransactions(houseId)
    ]);

    const history = [
      ...bets.map(bet => ({
        ...bet,
        movement_type: 'BET'
      })),
      ...transactions.map(transaction => ({
        ...transaction,
        movement_type: transaction.movement_type
      }))
    ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return history;
  }
}