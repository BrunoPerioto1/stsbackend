// Cobre o que o service faz em volta do avaliador: quem ele consulta, o que
// reporta e o que NAO deixa escapar pra bet_results. A regra de liquidacao em
// si e' de settle.spec.

import { SettlementService } from './settlement.service';
import { ResultIdEnum } from '../bet/dto/result-id.enum';

function makeService(
  overrides: {
    settleable?: any[];
    legs?: any[];
    pending?: any[];
    dismissed?: number;
    queue?: any;
  } = {},
) {
  const repository = {
    findSettleable: jest.fn().mockResolvedValue(overrides.settleable ?? []),
    findLegs: jest.fn().mockResolvedValue(overrides.legs ?? []),
    saveSuggestions: jest.fn().mockResolvedValue(undefined),
    findPendingSuggestions: jest
      .fn()
      .mockResolvedValue(overrides.pending ?? []),
    dismiss: jest.fn().mockResolvedValue(overrides.dismissed ?? 0),
    queue: jest.fn().mockResolvedValue(
      overrides.queue ?? { pending: 0, settleable: 0, suggestions: 0, undecided: 0 },
    ),
  };
  const betService = { finalizeMany: jest.fn().mockResolvedValue(undefined) };
  const service = new SettlementService(repository as any, betService as any);
  return { service, repository, betService };
}

function aposta(id: number, market: string, home: number, away: number) {
  return {
    id,
    game: 'Flamengo x Vasco',
    market,
    homeName: 'Flamengo',
    awayName: 'Vasco',
    homeScore: home,
    awayScore: away,
    eventStatus: 'finished',
  };
}

describe('computeSuggestions', () => {
  it('grava sugestao sem tocar em resultado', async () => {
    const { service, repository, betService } = makeService({
      settleable: [aposta(1, 'Mais de 2.5 - Total de gols', 2, 1)],
    });

    const resumo = await service.computeSuggestions(10 as any);

    expect(resumo).toEqual({
      analyzed: 1,
      suggested: 1,
      undecided: 0,
      hasMore: false,
    });
    expect(repository.saveSuggestions).toHaveBeenCalledWith([
      expect.objectContaining({
        betId: 1,
        suggestedResultId: ResultIdEnum.WON,
        reason: null,
      }),
    ]);
    // O unico caminho pra bet_results e' a confirmacao do usuario.
    expect(betService.finalizeMany).not.toHaveBeenCalled();
  });

  it('conta como indecisa a aposta que o avaliador recusou', async () => {
    const { service, repository } = makeService({
      settleable: [aposta(2, 'Mais de 8.5 escanteios', 2, 1)],
    });

    const resumo = await service.computeSuggestions(10 as any);

    expect(resumo).toMatchObject({ suggested: 0, undecided: 1 });
    expect(repository.saveSuggestions).toHaveBeenCalledWith([
      expect.objectContaining({
        suggestedResultId: null,
        reason: 'DADO_INDISPONIVEL',
      }),
    ]);
  });

  it('multipla de varios jogos liquida cada perna no proprio jogo', async () => {
    const perna = (position: number, homeName: string, awayName: string, home: number, away: number) => ({
      betId: 5, position, homeName, awayName, homeScore: home, awayScore: away,
      eventStatus: 'finished', eventSport: 'Football', scoreScope: 'REGULATION', facts: null,
    });
    const { service, repository } = makeService({
      settleable: [{
        ...aposta(5, 'Boca Juniors e São Paulo vencerem - Resultado final', 0, 2),
        game: 'CD Recoleta x Boca Juniors / São Paulo x Bolívar',
      }],
      legs: [perna(0, 'CD Recoleta', 'Boca Juniors', 0, 2), perna(1, 'São Paulo', 'Bolívar', 2, 0)],
    });

    await service.computeSuggestions(10 as any);

    expect(repository.findLegs).toHaveBeenCalledWith([5]);
    expect(repository.saveSuggestions).toHaveBeenCalledWith([
      expect.objectContaining({
        betId: 5,
        suggestedResultId: ResultIdEnum.WON,
        homeScore: null,
        awayScore: null,
      }),
    ]);
  });

  it('avisa que sobrou backlog quando o lote enche', async () => {
    const lote = Array.from({ length: 200 }, (_, i) =>
      aposta(i + 1, 'Mais de 2.5 - Total de gols', 2, 1),
    );
    const { service } = makeService({ settleable: lote });

    // Sem o aviso, aposta antiga ficaria presa fora da janela pra sempre.
    expect(await service.computeSuggestions(10 as any)).toMatchObject({
      hasMore: true,
    });
  });
});

describe('confirm', () => {
  it('filtra no banco em vez de trazer a lista toda', async () => {
    const { service, repository } = makeService({
      pending: [{ betId: 1, suggestedResultId: ResultIdEnum.WON }],
    });

    await service.confirm([1, 2] as any, 10 as any);

    expect(repository.findPendingSuggestions).toHaveBeenCalledWith(10, [1, 2]);
  });

  it('agrupa por resultado sugerido, uma finalizacao por grupo', async () => {
    const { service, betService } = makeService({
      pending: [
        { betId: 1, suggestedResultId: ResultIdEnum.WON },
        { betId: 2, suggestedResultId: ResultIdEnum.LOST },
        { betId: 3, suggestedResultId: ResultIdEnum.WON },
      ],
    });

    expect(await service.confirm([1, 2, 3] as any, 10 as any)).toEqual({
      confirmed: 3,
    });
    expect(betService.finalizeMany).toHaveBeenCalledTimes(2);
    expect(betService.finalizeMany).toHaveBeenCalledWith(
      [1, 3],
      ResultIdEnum.WON,
      10,
    );
    expect(betService.finalizeMany).toHaveBeenCalledWith(
      [2],
      ResultIdEnum.LOST,
      10,
    );
  });

  it('id sem sugestao viva nao e planilhado', async () => {
    const { service, betService } = makeService({ pending: [] });

    expect(await service.confirm([99] as any, 10 as any)).toEqual({
      confirmed: 0,
    });
    expect(betService.finalizeMany).not.toHaveBeenCalled();
  });
});

describe('dismiss', () => {
  it('conta o que o UPDATE atingiu, nao o que veio no body', async () => {
    // Dois ids pedidos, um so' e' do usuario: a resposta nao pode dizer 2.
    const { service } = makeService({ dismissed: 1 });

    expect(await service.dismiss([1, 2] as any, 10 as any)).toEqual({
      dismissed: 1,
    });
  });
});

describe('queue', () => {
  it('sinaliza lote restante quando ainda ha candidato', async () => {
    const { service } = makeService({
      queue: { pending: 40, settleable: 18, suggestions: 12, undecided: 3 },
    });

    await expect(service.queue(1 as any)).resolves.toMatchObject({
      pending: 40,
      settleable: 18,
      suggestions: 12,
      undecided: 3,
      hasMore: true,
    });
  });

  it('calcula antes de contar quando tem placar esperando', async () => {
    const { service, repository } = makeService({
      settleable: [aposta(1, 'Mais de 2.5 gols', 2, 1)],
    });
    repository.queue
      .mockResolvedValueOnce({ pending: 1, settleable: 1, suggestions: 0, undecided: 0 })
      .mockResolvedValueOnce({ pending: 1, settleable: 0, suggestions: 1, undecided: 0 });

    await expect(service.queue(1 as any)).resolves.toEqual({
      pending: 1,
      settleable: 0,
      suggestions: 1,
      undecided: 0,
      computed: 1,
      hasMore: false,
    });
    expect(repository.saveSuggestions).toHaveBeenCalledTimes(1);
  });

  it('sem placar novo nao recalcula nada', async () => {
    const { service, repository } = makeService({
      queue: { pending: 3, settleable: 0, suggestions: 2, undecided: 0 },
    });
    await expect(service.queue(1 as any)).resolves.toMatchObject({ computed: 0 });
    expect(repository.findSettleable).not.toHaveBeenCalled();
  });

  it('fila drenada nao oferece proximo lote', async () => {
    const { service } = makeService({
      queue: { pending: 5, settleable: 0, suggestions: 0, undecided: 2 },
    });

    await expect(service.queue(1 as any)).resolves.toMatchObject({ hasMore: false });
  });
});
