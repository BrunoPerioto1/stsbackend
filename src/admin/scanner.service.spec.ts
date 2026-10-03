import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ScannerService } from './scanner.service';

function setup(updated: object[] = []) {
  const repository = {
    update: jest.fn().mockResolvedValue(updated),
    create: jest.fn(),
    delete: jest.fn().mockResolvedValue(0),
  };
  return { service: new ScannerService(repository as any), repository };
}

describe('ScannerService', () => {
  it('PATCH vazio é 400 nas duas rotas, sem tocar no banco', async () => {
    const { service, repository } = setup();
    await expect(service.update(17, {})).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.updateSport(1, { lineups: undefined })).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('lote que não alterou nenhuma linha é 404', async () => {
    const { service } = setup([]);
    await expect(service.updateSport(99, { lineups: false })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('manda só as flags enviadas', async () => {
    const { service, repository } = setup([{ id: 17 }]);
    await service.update(17, { lineups: false, statistics: undefined });
    expect(repository.update).toHaveBeenCalledWith({ id: 17 }, { lineups: false });
  });

  it('id repetido e esporte inexistente viram 400', async () => {
    const { service, repository } = setup();
    repository.create.mockRejectedValueOnce({ code: '23505' }).mockRejectedValueOnce({ code: '23503' });
    const dto = { id: 17, name: 'Premier League', sportId: 1 };
    await expect(service.create(dto)).rejects.toThrow('já está no scanner');
    await expect(service.create(dto)).rejects.toThrow('Esporte não encontrado');
  });

  it('excluir o que não existe é 404', async () => {
    const { service } = setup();
    await expect(service.remove(17)).rejects.toBeInstanceOf(NotFoundException);
  });
});
