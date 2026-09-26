import { NotFoundException } from '@nestjs/common';
import { TransactionService } from './transaction.service';
import { TransactionTypeEnum } from './dto/transaction.dto';
import type { TransactionRepository } from '../infra/repository/transaction.repository';

function setup(existing: object | undefined) {
  const repository = {
    findById: jest.fn().mockResolvedValue(existing),
    update: jest.fn().mockResolvedValue({ id: 5 }),
    delete: jest.fn().mockResolvedValue({ numDeletedRows: BigInt(1) }),
  };
  return { repository, service: new TransactionService(repository as unknown as TransactionRepository) };
}

const deposito = { id: 5, userId: 1, houseId: 3, transactionTypeId: TransactionTypeEnum.DEPOSIT, value: 100, description: 'Depósito' };

describe('TransactionService: editar e excluir movimentação', () => {
  it('saque editado continua saindo com sinal negativo', async () => {
    const { repository, service } = setup({ ...deposito, transactionTypeId: TransactionTypeEnum.WITHDRAWAL, value: -50 });
    await service.updateTransaction(5, 1, { value: 80 });
    expect(repository.update).toHaveBeenCalledWith(5, 1, expect.objectContaining({ value: -80 }));
  });

  it('trocar depósito por saque sem mexer no valor inverte o sinal', async () => {
    const { repository, service } = setup(deposito);
    await service.updateTransaction(5, 1, { transactionTypeId: TransactionTypeEnum.WITHDRAWAL });
    expect(repository.update).toHaveBeenCalledWith(
      5, 1, expect.objectContaining({ value: -100, transactionTypeId: TransactionTypeEnum.WITHDRAWAL }),
    );
  });

  it('ajuste mantém o sinal que foi digitado', async () => {
    const { repository, service } = setup({ ...deposito, transactionTypeId: TransactionTypeEnum.ADJUSTMENT, value: 10 });
    await service.updateTransaction(5, 1, { value: -30 });
    expect(repository.update).toHaveBeenCalledWith(5, 1, expect.objectContaining({ value: -30 }));
  });

  it('movimentação de outro usuário (ou inexistente) é 404', async () => {
    const { repository, service } = setup(undefined);
    await expect(service.updateTransaction(5, 1, { value: 1 })).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.deleteTransaction(5, 1)).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.update).not.toHaveBeenCalled();
    expect(repository.delete).not.toHaveBeenCalled();
  });

  it('excluir remove só a do próprio usuário', async () => {
    const { repository, service } = setup(deposito);
    await service.deleteTransaction(5, 1);
    expect(repository.delete).toHaveBeenCalledWith(5, 1);
  });
});
