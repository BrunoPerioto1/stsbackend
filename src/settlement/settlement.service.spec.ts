// Cobre o que o service faz em volta do avaliador: quem ele consulta, o que
// reporta e o que NAO deixa escapar pra bet_results. A regra de liquidacao em
// si e' de settle.spec.

import { SettlementService } from './settlement.service';
import { ResultIdEnum } from '../bet/dto/result-id.enum';

function makeService(
  overrides: {
    settleable?: any[];
    pending?: any[];
    dismissed?: number;
  } = {},
) {
  const repository = {
    findSettleable: jest.fn().mockResolvedValue(overrides.settleable ?? []),
    saveSuggestions: jest.fn().mockResolvedValue(undefined),
    findPendingSuggestions: jest
      .fn()
      .mockResolvedValue(overrides.pending ?? []),
    dismiss: jest.fn().mockResolvedValue(overrides.dismissed ?? 0),
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
        reason: 'OUTRA_CATEGORIA',
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
