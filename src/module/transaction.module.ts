import { Module } from '@nestjs/common';
import { TransactionController } from '../transactions/transaction.controller';
import { TransactionService } from '../transactions/transaction.service';
import { TransactionRepository } from '../infra/repository/transaction.repository';

@Module({
  controllers: [TransactionController],
  providers: [TransactionService, TransactionRepository],
})
export class TransactionModule {}
