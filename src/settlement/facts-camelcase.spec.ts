import { CamelCasePlugin } from 'kysely';
import { decodeFacts } from './event-facts';

// O repositorio le event_facts.data_json como texto. Este teste trava o motivo:
// o CamelCasePlugin renomeia chave de objeto aninhado, e `periods.FIRST_HALF`
// chegava como `FIRSTHALF` — o avaliador dizia "placar do primeiro tempo
// indisponivel" com o dado no banco.
describe('event_facts atravessando o CamelCasePlugin', () => {
  const dataJson = {
    periods: {
      FIRST_HALF: { home: 1, away: 0 },
      SECOND_HALF: { home: 0, away: 2 },
    },
  };

  const transform = async (facts: unknown) => {
    const { rows } = await new CamelCasePlugin().transformResult({
      result: { rows: [{ facts }] },
      queryId: { queryId: 'facts' },
    });
    return (rows[0] as { facts: unknown }).facts;
  };

  it('jsonb perde os periodos', async () => {
    const facts = decodeFacts(await transform(dataJson));
    expect(facts.periods?.FIRST_HALF).toBeUndefined();
  });

  it('texto preserva os periodos', async () => {
    const texto = (await transform(JSON.stringify(dataJson))) as string;
    const facts = decodeFacts(JSON.parse(texto));
    expect(facts.periods).toEqual(dataJson.periods);
  });
});
