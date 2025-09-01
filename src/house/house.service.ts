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
    const fuzzyHouse = await this.houseRepository.findByName(text);
    return fuzzyHouse?.id || null;
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
    const realHouseBalance = Number(betsData.total_stake) + Number(betsData.total_bet_profit) + Number(totalTransactions);
    
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

    // Criar um mapa de transações por house_id
    const transactionsMap = new Map();
    transactionsResult.forEach(row => {
      transactionsMap.set(row.house_id, row.total_transactions);
    });

    // Combinar os resultados
    return betsResult.map(betsData => {
      const totalTransactions = transactionsMap.get(betsData.house_id) || 0;
      const realHouseBalance = Number(betsData.total_stake) + Number(betsData.total_bet_profit) + Number(totalTransactions);
      
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

  async createTransaction(createTransactionDto: CreateTransacaoDto) {
    // Validate if house exists
    const house = await this.houseRepository.findById(createTransactionDto.house_id);
    if (!house) {
      throw new NotFoundException(`House with ID ${createTransactionDto.house_id} not found`);
    }

    // Validate withdrawal amount if it's a withdrawal transaction (type_id = 2)
    if (createTransactionDto.transaction_type_id === 2) {
      const currentBalance = await this.calculateHouseBalance(createTransactionDto.house_id);
      const withdrawalAmount = Math.abs(createTransactionDto.valor); // Saques são negativos
      
      if (currentBalance.house_balance < withdrawalAmount) {
        throw new NotFoundException(
          `Saldo insuficiente para saque. Saldo atual: R$ ${currentBalance.house_balance.toFixed(2)}, Valor solicitado: R$ ${withdrawalAmount.toFixed(2)}`
        );
      }
    }

    return this.houseRepository.createTransaction(createTransactionDto);
  }

  async findTransactionsByHouse(houseId: number) {
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