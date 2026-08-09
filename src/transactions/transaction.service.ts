// transaction.service.ts
import { Injectable } from '@nestjs/common';
import { TransactionRepository } from '../infra/repository/transaction.repository';
import { NewTransactionDto, TransactionTypeEnum } from './dto/transaction.dto';
import { TransactionFilterDto } from './dto/transaction.filter.dto';
import type { UserId } from '../db_types/Users';
import type { BettingHouseId } from '../db_types/BettingHouse';
import type { TransactionTypeId } from '../db_types/TransactionsTypes';

@Injectable()
export class TransactionService {
  constructor(private readonly transactionRepository: TransactionRepository) {}

  private defaultDescription(transactionTypeId: number): string {
    switch (transactionTypeId) {
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
    if (transactionData.transactionTypeId === TransactionTypeEnum.WITHDRAWAL) {
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