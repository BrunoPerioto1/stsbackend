// transaction.service.ts
import { Injectable } from '@nestjs/common';
import { TransactionRepository } from '../infra/repository/transaction.repository';
import { NewTransactionDto } from './dto/transaction.dto';
import { TransactionFilterDto } from './dto/transaction.filter.dto';

@Injectable()
export class TransactionService {
  constructor(private readonly transactionRepository: TransactionRepository) {}

  async createTransaction(transactionData: NewTransactionDto) {
    if (transactionData.transactionTypeId === 2) { 
      transactionData.value = -Math.abs(transactionData.value);
    }
    return this.transactionRepository.create(transactionData);
  }

  async findAllTransactions(filter?: TransactionFilterDto) {
    return this.transactionRepository.findAllTransactions(filter);
  }
}