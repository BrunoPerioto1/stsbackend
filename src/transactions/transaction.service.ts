// transaction.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { TransactionRepository } from '../infra/repository/transaction.repository';
import { NewTransactionDto, TransactionTypeEnum, UpdateTransactionDto } from './dto/transaction.dto';
import { TransactionFilterDto } from './dto/transaction.filter.dto';
import type { UserId } from '../db_types/Users';
import type { BettingHouseId } from '../db_types/BettingHouse';
import type { TransactionTypeId } from '../db_types/TransactionsTypes';
import type { HouseTransactionId } from '../db_types/HouseTransactions';

@Injectable()
export class TransactionService {
  constructor(private readonly transactionRepository: TransactionRepository) {}

  private defaultDescription(transactionTypeId: number): string {
    switch (transactionTypeId as TransactionTypeEnum) {
      case TransactionTypeEnum.DEPOSIT:
        return 'Depósito';
      case TransactionTypeEnum.WITHDRAWAL:
        return 'Saque';
      case TransactionTypeEnum.ADJUSTMENT:
        return 'Ajuste manual';
      default:
        return 'Movimentação';
    }
  }

  async createTransaction(transactionData: NewTransactionDto & { userId: number }) {
    if ((transactionData.transactionTypeId as TransactionTypeEnum) === TransactionTypeEnum.WITHDRAWAL) {
      transactionData.value = -Math.abs(transactionData.value);
    }
    return this.transactionRepository.create({
      houseId: transactionData.houseId as BettingHouseId,
      userId: transactionData.userId as UserId,
      transactionTypeId: transactionData.transactionTypeId as TransactionTypeId,
      value: transactionData.value,
      description: transactionData.description || this.defaultDescription(transactionData.transactionTypeId),
    });
  }

  // Saque sai sempre negativo, depósito sempre positivo; ajuste vale com o
  // sinal digitado. Mesma regra da criação e do saldo real (house.service).
  private signed(type: TransactionTypeEnum, value: number) {
    if (type === TransactionTypeEnum.WITHDRAWAL) return -Math.abs(value);
    if (type === TransactionTypeEnum.DEPOSIT) return Math.abs(value);
    return value;
  }

  async updateTransaction(id: number, userId: number, changes: UpdateTransactionDto) {
    const current = await this.transactionRepository.findById(id as HouseTransactionId, userId as UserId);
    if (!current) throw new NotFoundException('Movimentação não encontrada.');

    const type = (changes.transactionTypeId ?? current.transactionTypeId) as TransactionTypeEnum;
    const value = this.signed(type, changes.value ?? Number(current.value));
    await this.transactionRepository.update(id as HouseTransactionId, userId as UserId, {
      transactionTypeId: type as unknown as TransactionTypeId,
      value,
      ...(changes.description !== undefined && { description: changes.description || this.defaultDescription(type) }),
    });
    return { id, transactionTypeId: type, value };
  }

  async deleteTransaction(id: number, userId: number) {
    const current = await this.transactionRepository.findById(id as HouseTransactionId, userId as UserId);
    if (!current) throw new NotFoundException('Movimentação não encontrada.');
    await this.transactionRepository.delete(id as HouseTransactionId, userId as UserId);
  }

  async findAllTransactions(userId: number, filter?: TransactionFilterDto) {
    return this.transactionRepository.findAllTransactions(userId as UserId, {
      houseId: filter?.houseId as BettingHouseId | undefined,
      startDate: filter?.startDate ? new Date(filter.startDate) : undefined,
      endDate: filter?.endDate ? new Date(filter.endDate) : undefined,
    });
  }

  async findAllTypeTransactions() {
    return this.transactionRepository.findAllTypeTransactions();
  }
}