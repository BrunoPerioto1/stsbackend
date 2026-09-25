# Revisão de código, UX e telas novas (back + front)

Revisão de 2026-09-24 cobrindo `meu-bot-telegram` (API NestJS + jobs Python) e
`sts` (front React). Caminhos com prefixo `sts/` são do repositório do front.

Estado no dia: backend com typecheck limpo e 640 testes passando; front com
typecheck limpo, 46 testes passando e 7 warnings de lint.

---

## 1. Bugs que mexem em dinheiro ou dado

- [x] **ROI calculado de dois jeitos.** Dashboard e detalhe da casa dividem o lucro
  por todo o valor apostado, incluindo pendentes e canceladas
  (`src/infra/repository/dashboard.repository.ts:189`,
  `src/dashboard/dashboard.service.ts:57`,
  `sts/src/components/house/HouseDetailsModal.tsx:41`,
  `sts/src/components/house/mobile/HouseDetailScreen.tsx:36`). O ranking de casas
  divide só pelo liquidado. Quem tem muita aposta em aberto vê ROI menor.
- [x] **"Saldo real" não desconta apostas em aberto.** A casa mostra o saldo já
  sem o stake das pendentes; o app conta esse stake como saldo (pendente tem
  lucro null). O ajuste sai negativo no valor das pendentes e fica pra sempre
  depois que a aposta liquida (`sts/src/components/house/NovaTransacaoModal.tsx:49`,
  `betsAggregate` em `src/infra/repository/house.repository.ts`). Agregar o
  stake em aberto por casa e comparar com "saldo − em aberto".
- [x] **Aposta duplicada em clique duplo.** O lock do bot é um `Set` em memória
  (`src/telegram/telegram-callback.service.ts:31`), que não vale entre instâncias
  da Vercel. O Planilhar do site consulta e depois insere sem lock
  (`src/tips/tips.service.ts:82`). Resolver com índice único parcial:
  `CREATE UNIQUE INDEX ON bets (user_id, tip_id) WHERE tip_id IS NOT NULL AND deleted_at IS NULL`.
  *Migration `20260925_bets_unique_tip_per_user.sql` ainda precisa ser aplicada no banco.*
- [x] **Planilhar pelo Telegram recalcula a stake com a banca atual**
  (`src/telegram/bet-text.service.ts:100`) em vez de usar o `🎯 Recomendação de
  aposta` que o card mostrou. Diverge quando a banca muda entre a entrega e o clique.
- [x] **Casa desativada some do saldo do usuário.** `findAllHousesBalance` filtra
  `isActive = true` (`src/infra/repository/house.repository.ts:146`).
- [x] **Exportar apostas no Perfil não funciona.** Pede `perPage: 5000`
  (`sts/src/lib/bet-exports.ts:33`); o DTO limita em 1000
  (`src/bet/dto/bet-filter.dto.ts:84`) → 400, e o erro não é tratado.
- [x] **`/stake 1500,50` grava 150050** (`src/telegram/bot-commands.service.ts:108`).
  Usar `normalizeBetNumber`.
- [x] **Banca padrão inventada.** Sem `/stake`, `getUserStake` devolve 2000
  (`src/users/users.service.ts:193`) e o bot recomenda stake sobre ela.
- [x] **Editar jogo/mercado não refaz o casamento de evento**
  (`src/bet/bet.service.ts:204`); a liquidação usa o placar do jogo antigo.
- [x] **Retry do Telegram duplica DMs.** `recordTip` é idempotente, mas o loop de
  envio roda de novo (`src/telegram/tip-fanout.service.ts:97`). Pular o fan-out
  quando o insert não foi novo.
- [x] **Admin não consegue desativar conta.** `is_active` é checado em todo lugar,
  mas nenhuma rota grava a coluna (`src/admin/dto/admin.dto.ts`).
- [x] Menores: `UpdateApostaDto.house` não é coluna (`src/bet/dto/bet.dto.ts:135`);
  `GET /house/:id` sem `ParseIntPipe`; username sem `MaxLength` (coluna de 50).

## 2. Fluxos que travam ou confundem

- [ ] **Conferência só calcula quando o usuário clica.** O job traz placar 3x/dia,
  mas o badge conta só sugestões já calculadas
  (`sts/src/components/layout/BottomNav.tsx:68`). Calcular automaticamente (no fim
  do job ou ao abrir a tela com `settleable > 0`); sugestão não grava resultado.
- [ ] **Cadastro usa "Nome" como username único**
  (`sts/src/hooks/auth/use-register-form.ts:49`). Dois "Bruno" colidem com
  "Username já cadastrado".
- [ ] **Conta nova cai em "Seu acesso venceu"** com `TRIAL_DAYS=0`
  (`sts/src/pages/RenovarPage.tsx:35`). Texto certo: "Ative sua conta".
- [ ] **PIX sem identificação do pagante.** Gerar PIX copia-e-cola (BR Code
  estático) com valor e `txid` do usuário; botão "Já paguei" avisando o admin.
- [ ] **Login revela e-mails cadastrados** (`attemptsLeft` só para conta que
  existe, `src/auth/auth.service.ts:77`). Decidir se é aceitável.
- [ ] **"Esqueci a senha" é um toast** (`sts/src/components/auth/LoginForm.tsx:67`);
  **"Manter conectado" só lembra o e-mail**.
- [ ] **`/filtro` aceita qualquer valor ≥ 0**
  (`src/telegram/bot-commands.service.ts:81`); o site aceita 0,01–5
  (`src/users/dto/request.dto.ts:76`).

## 3. Segurança

- [ ] **Token do bot na URL do webhook** (`src/telegram/telegram.controller.ts:20`)
  aparece nos logs da Vercel. Usar `secret_token` no `setWebhook` e validar o
  header `X-Telegram-Bot-Api-Secret-Token`.
- [ ] **Pool do Postgres sem SSL** (`src/infra/db/db.ts:6`), salvo `PGSSLMODE` na Vercel.
- [ ] **Excluir conta só pede o token** (`src/users/users.service.ts:53`); pedir a senha.
- [ ] **CORS aberto** (`src/create-app.ts:15`); restringir ao domínio do front.
- [ ] **Front sem headers de segurança** (CSP, `X-Frame-Options`) em `sts/vercel.json`;
  aproveitar e pôr cache `immutable` em `/assets`.
- [ ] Sem limite por usuário no `parse-image` (custo OpenAI) e no `/vincular`.

## 4. Banco e datas

- [ ] **`schema.sql` não sobe o banco atual**: faltam `tips`, `tip_dismissals`,
  `tip_deliveries`, `bets.tip_id` e o índice único de `(chat_id, message_id)`.
  Migrations sem tabela de controle.
- [ ] **Rodar local desloca 3h.** Colunas `TIMESTAMP` sem fuso + `pg` usando o fuso
  da máquina. Paliativo: `TZ=UTC` no `.env`. Definitivo: `timestamptz`.
- [ ] `bets.odd DECIMAL(5,2)` limita a 999,99 e arredonda odd de 3 casas.

## 5. Desempenho

- [ ] **Fan-out sequencial** (`src/telegram/tip-fanout.service.ts:112`): trazer
  `stake` na query de usuários e enviar em paralelo com teto.
- [ ] **Finalizar em lote faz 2 queries por aposta**
  (`src/infra/repository/bet.repository.ts:194`); usar `UPDATE ... FROM (VALUES ...)`.
- [ ] **Lista de tips pagina em memória sobre o histórico inteiro**
  (`src/tips/tips.service.ts:261`).
- [ ] **Lista de apostas baixa tudo a cada filtro**
  (`sts/src/hooks/apostas/use-bets-query.ts:57`); paginação virou código morto.
  Totais por mês do `monthly-summary`, linhas só do mês expandido.

## 6. Qualidade de código

- [ ] **CI rodando testes** (hoje só existe o cron do SofaScore): `tsc`, `jest`,
  `eslint`, `vite build` em push/PR nos dois repositórios.
- [ ] Tipagem: front com `"strict": false`, back com `noImplicitAny: false` e `ctx: any`.
- [ ] `GrokService` instanciado 3x e derruba a API se faltar `GROQ_API_KEY`
  (`src/telegram/grok.service.ts:15`); mover `resolveHouseId` pro `HouseService`.
- [ ] `dotenv.config()` em 9 arquivos → `@nestjs/config` com validação no boot.
- [ ] 54 `console.*` vs 2 `Logger`; padronizar.
- [ ] Filtros duplicados em `findBets`/`countBets` e no dashboard; 9 instâncias de
  axios com o mesmo interceptor.
- [ ] `TipsPage` (11 `useState`) e `AdminHouses` (14) pedem hooks extraídos.
- [ ] URL `stsfront.vercel.app` fixa em 3 mensagens do bot → env.

## 7. Front: detalhes visuais

- [ ] **Tabela do AdminUsers corta colunas** entre 640px e ~1450px: grid de ~1104px
  com `overflow-hidden` no `AdminPanel` (`sts/src/components/admin/AdminUsers.tsx:19`).
  Usar `overflow-x-auto` ou trocar `sm:` por `xl:`.
- [ ] **Sidebar com 256px e margem de 248px**
  (`sts/src/components/layout/AppSidebar.tsx:100`, `AppShell.tsx:58`); estado
  recolhido não persiste.
- [ ] **Dashboard desktop busca o período anterior e não mostra**; filtro por casa
  sem UI e mandando `house_id` (`sts/src/api/routes/get-dashboard-daily.ts:4`).
- [ ] Conferência com verde/vermelho fixos (ignora as cores de Preferências).
- [ ] CSV "Resumo mensal" promete ROI e não tem.

---

## 8. UX nas telas existentes

- **Tips** (186 pendentes no print): separar "ainda dá tempo" de "jogo já começou"
  pelo `eventStartAt`; ordenar pelo início ("começa em 40 min"); ação "marcar
  todas as começadas como caiu"; badge de Tips no menu.
- **Apostas**: faixa com totais do filtro (apostado, lucro, ROI, acerto); filtro por
  origem e por "sem jogo identificado"; badge só para jogo que acabou e segue pendente.
- **Casas**: "em aberto" e "disponível" separados; "18 negativas" vira botão pra
  conciliar; editar/excluir movimentação; agrupar com saldo / paradas / sem uso.
- **Dashboard**: comparativo no desktop; filtro por casa e esporte; estado vazio
  vira checklist.
- **Conferência**: cálculo automático; aviso no bot "N apostas prontas pra conferir".
- **Telegram (Perfil)**: deep link `t.me/betbpbot?start=<código>` vincula com um toque.
- **Login / renovação**: recuperar senha pelo Telegram; PIX copia-e-cola; "Já paguei".
- **Admin Usuários**: ativar/desativar; confirmar promoção a admin; filtro
  "vence em 7 dias".
- **Mobile**: PWA (manifest) para instalar; Web Share Target no Android abre a
  Nova aposta direto do print compartilhado.

## 9. Telas novas

| Tela | O que resolve | Base existente | Esforço |
|---|---|---|---|
| Primeiros passos | Conta nova sem rumo | Vínculo, banca e casas no `/users/me` | P |
| Agenda | O que rola hoje e o que espera placar | `eventStartAt` + `event_results` | P |
| Conciliação guiada | Casas negativas / saldo divergente | Ajuste "Saldo real" | P/M |
| Análise | Lucro por mercado, esporte, faixa de odd, dia, casa, origem | Parser de mercados da liquidação | M |
| Desempenho do canal | Vale seguir? Qual filtro de %? | `tips.percent`, `bets.tip_id`, motor de liquidação | M/G |
| Banca e limites | Exposição, meta, stop-loss, drawdown | Stakes pendentes + banca | M |
| Admin · Financeiro | Vencimentos, receita, histórico de pagamentos | Falta tabela `payments` | M |
| Avisos do bot | Escolher resumo diário, conferência, vencimento | Bot + cron | P |

## 10. Ordem sugerida

1. Bugs da seção 1 (inclui o índice único).
2. Conferência automática + cadastro/renovação (seção 2).
3. CI rodando os testes.
4. Webhook com `secret_token` + SSL no pool; `TZ=UTC` local; `schema.sql` atualizado.
5. UX de Tips (por horário) e Casas (disponível vs em aberto).
6. Telas novas: Primeiros passos e Agenda → Análise → Desempenho do canal.
