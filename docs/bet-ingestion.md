# Blindagem do planilhamento

## Arquitetura e reaproveitamento

O webhook entra em `src/telegram/telegram.controller.ts`; `TelegramService`
distribui mensagens, fotos e voice/audio. Texto usa `parseBetLocal` nos templates
conhecidos e `GrokService.parseBetMessage` como fallback. Imagem usa
`BetImageService`/OpenAI; áudio usa `BetAudioService` para transcrição e extração.
Ambos geram `buildBetPreview`; o callback chama `BetTextService.processBetText`.
`BetService.createBet` atende Telegram e API autenticada; `BetRepository.create`
grava aposta e resultado na transação já existente. Models: `CreateBetDto`,
`src/db_types/Bet.ts` e `src/infra/db/schema.sql`.

**Casas:** `GrokService.resolveHouseId` continua sendo o único mecanismo de
identificação do Telegram. Usa `HouseService.getAllHouses`, `normalizeName`,
aliases cadastrados e similaridade mínima de 0,8. Os três fluxos já o utilizavam;
imagem valida a legenda, áudio valida a casa extraída e o clique revalida o card.
Texto agora usa diretamente o ID resolvido, ignorando qualquer ID inventado pela
IA. A API manual continua recebendo o ID selecionado no app, com integridade pela
FK existente. Nenhum matcher novo foi criado.

## Pipeline entregue

1. Extração específica de texto/imagem/áudio.
2. `normalizeBetData`: limpeza conservadora de fragmentos de UI e números.
3. Validações existentes, incluindo casa, campos obrigatórios e sizing de stake
   por percentual/limite. Imagem/áudio mantêm preview e confirmação existentes.
4. `BetService.createBet` normaliza novamente para proteger também a API e
   reutiliza os decorators do `CreateBetDto` para validar antes do banco.
5. Consulta de candidatos no banco de escrita por usuário, casa e `createdAt`
   nos últimos cinco minutos; comparação pelo fingerprint central.
6. Criação normal, com origem determinada pelo backend e retorno adicional
   `duplicate: { isPotentialDuplicate, existingBetId?, reason? }`.

A duplicata não bloqueia, exclui nem sobrescreve. O retorno fica pronto para um
aviso futuro no Telegram; os botões e mensagens visíveis atuais foram mantidos.
O fingerprint compara `x`/`vs`/`versus`, caixa, espaços, decimais em rótulos e
valores numéricos. Não faz matching semântico de mercados diferentes.

Labels de UI ficam em `BET_UI_LABELS`; só fragmentos inteiros, isolados por
separadores ou linhas, são removidos. Nomes e condições legítimas são preservados.
Números inválidos retornam `null`, nunca zero por falha de parsing. Os prompts
compartilham regras de separação evento/mercado e inferência prudente de esporte.
Esporte desconhecido permanece `null` na extração; o fluxo existente solicita
correção antes de salvar porque DTO/schema exigem esporte.

## Origem e banco

`source`: `telegram` ou `app`; `sourceType`: `text`, `image`, `audio` ou `manual`.
Esses valores são argumentos internos, não campos editáveis do DTO público.
IDs de mensagem/chat são gravados quando disponíveis; chat usa texto para evitar
perda de precisão. Timestamp vem da mensagem/preview Telegram ou backend, nunca
da extração da IA. Criação manual preserva a data informada pelo usuário.
O callback interno acrescenta marcador numérico de mídia; callbacks antigos
continuam aceitos, com identificação pelo reply quando disponível.

Antes de iniciar o backend atualizado, aplicar o bloco final de
`src/infra/db/schema.sql`, seguindo o SQL idempotente adotado pelo projeto:

```sql
ALTER TABLE bets ADD COLUMN IF NOT EXISTS source VARCHAR(16);
ALTER TABLE bets ADD COLUMN IF NOT EXISTS source_type VARCHAR(16);
ALTER TABLE bets ADD COLUMN IF NOT EXISTS telegram_message_id INTEGER;
ALTER TABLE bets ADD COLUMN IF NOT EXISTS telegram_chat_id TEXT;
CREATE INDEX IF NOT EXISTS idx_bets_duplicate_candidates
  ON bets (user_id, house_id, created_at);
```

Origem antiga permanece `NULL`, sem backfill que invente procedência.
O SQL foi preparado, mas não executado contra banco externo nesta tarefa.

## Diagnóstico e limites

`BET_DIAGNOSTICS=true`, fora de produção, habilita dados estruturados antes/depois
da normalização (`AI_EXTRACTION`/`BET_NORMALIZED`). Prompts, transcrição, mídia,
tokens e IDs Telegram não entram nesses logs. Produção recebe somente marcadores
resumidos de duplicata e falha de validação, além dos logs operacionais existentes.
O log incondicional do JSON/texto bruto do Groq foi removido.

- Detecção é consultiva: duas criações simultâneas podem não enxergar uma à outra.
- Janela usa horário de criação, não a data esportiva ou data editável da aposta.
- Sem casa identificada, não há indicação forte de duplicata.
- Callback legado de mídia sem reply não distingue áudio de imagem; nesse caso
  assume imagem. Novos callbacks levam o tipo explícito.
- Testes usam mocks de IA, Telegram e banco; não houve chamada real a esses serviços.
- Futuro: aviso com “Ver aposta”, confirmação opcional e serialização por usuário
  se a detecção de submissões concorrentes passar a ser necessária.

## Arquivos alterados/criados

- `src/bet/bet-normalization.ts`: normalização, fingerprint, origem e regras comuns.
- `src/bet/bet.service.ts`: validação central, detecção e persistência de origem.
- `src/bet/dto/bet.dto.ts`: conversão numérica antes da validação HTTP de criação.
- `src/db_types/Bet.ts`: tipos opcionais de origem na inserção.
- `src/infra/db/schema.sql`: colunas opcionais e índice de candidatos.
- `src/infra/repository/bet.repository.ts`: busca temporal no banco de escrita.
- `src/telegram/bet-text.service.ts`: normalização, ID oficial e origem Telegram.
- `src/telegram/bet-image.service.ts`: adaptador para normalização compartilhada.
- `src/telegram/bet-audio.service.ts`: regras compartilhadas e extração existente.
- `src/telegram/grok.service.ts`: prompt e logs sem conteúdo bruto em produção.
- `src/telegram/telegram-callback.service.ts`: transporte de origem na confirmação.
- `src/telegram/utils/bet-preview.util.ts`: marcador interno de tipo de mídia.
- `src/bet/bet-normalization.spec.ts`: limpeza, números e duplicatas/negativos.
- `src/bet/bet.service.spec.ts`: persistência, validação e duplicata sem bloqueio.
- `src/telegram/bet-ingestion.spec.ts`: casa oficial e origem no fluxo completo.
- `src/telegram/bet-image.service.spec.ts`: contrato interno do callback de imagem.
- `src/telegram/bet-audio.service.spec.ts`: contrato interno do callback de áudio.
- `docs/bet-ingestion.md`: arquitetura, operação e limitações.

Frontend `sts` não precisou de alterações.

## Verificação executada

- `npm test -- --runInBand --silent`: 8 suítes, 88 testes passando.
- `npx tsc --noEmit`: passou.
- `npm run build`: passou.
- `git diff --check`: passou.
- ESLint global, executado sem `--fix` para não modificar código fora do escopo:
  falha por problemas existentes. Comparação por regra com `HEAD` nos arquivos
  alterados não mostrou aumento após os ajustes; arquivos novos passaram no lint.
