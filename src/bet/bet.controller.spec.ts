import { BetController } from './bet.controller';
import type { BetService } from './bet.service';

describe('BetController: origem da aposta do site', () => {
  function setup() {
    const service = { createBet: jest.fn().mockResolvedValue({ id: 1 }) };
    return { service, controller: new BetController(service as unknown as BetService) };
  }
  const aposta = { game: 'A x B', market: 'Over 2.5', sport: 'Futebol', odd: 2, stake: 10, houseId: 3 };

  it('aposta lida de print grava sourceType image', async () => {
    const { service, controller } = setup();
    await controller.criar({ ...aposta, fromImage: true } as any, 7);
    expect(service.createBet).toHaveBeenCalledWith(
      expect.not.objectContaining({ fromImage: expect.anything() }),
      undefined,
      { source: 'app', sourceType: 'image' },
    );
  });

  it('sem fromImage continua manual, e tipId segue pro vínculo', async () => {
    const { service, controller } = setup();
    await controller.criar({ ...aposta, tipId: 42 } as any, 7);
    expect(service.createBet).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 7 }),
      42,
      { source: 'app', sourceType: 'manual' },
    );
  });
});
