# Telegram — operação

Notas operacionais do bot: registro de webhook e formato dos logs. Conteúdo de
runbook, não de apresentação — por isso vive aqui e não no README.

## Webhook: registro e duração

O backend **não** registra o webhook durante a inicialização. Depois do primeiro
deploy, ou ao mudar `APP_URL`/`TELEGRAM_BOT_TOKEN`, configure usando o ambiente
correto e a URL pública já disponível:

```bash
npm run telegram:webhook
```

O webhook já registrado continua válido; não precisa executar a cada deploy com
a mesma URL. **Não execute em build de preview**, que poderia redirecionar o bot
de produção. O comando não descarta updates pendentes e não imprime token.

Ao receber foto com legenda, o bot envia "⏳ Analisando a foto…" enquanto
identifica a casa e baixa a imagem em paralelo. O resultado substitui essa
mensagem. Se o aviso falhar, a leitura continua e o resultado é enviado
normalmente.

## Logs

Todos os valores em milissegundos.

| Log | Cobre |
|---|---|
| `[APP_INIT] duration_ms` | criação e inicialização do Nest na instância nova; não inclui provisionamento da Vercel nem carregamento anterior dos módulos |
| `[APP_READY] cold_start wait_ms` | espera pela aplicação em cada requisição |
| `[TELEGRAM_WEBHOOK] update_id status duration_ms` | processamento do update, incluindo inicialização do Telegraf/getMe quando necessária, até concluir o handler |
| `[BET_IMAGE_FLOW] chat_id message_id mode status feedback_ms house_ms get_file_ms download_ms ai_ms preview_ms total_ms` | aviso inicial, consulta de casa, obtenção do link, download dos bytes, leitura da IA, envio/edição do resultado e total do fluxo de foto |
| `[BET_IMAGE_AI] model mode input cached cache_write output total reasoning duration` | consumo de tokens e latência da chamada de visão |
| `[BET_SLIP_PARSE] status reason` | falha da leitura pela rota HTTP do app web |

Exemplo **ilustrativo**, não medição de produção:

```text
[BET_IMAGE_FLOW] chat_id=1 message_id=10 mode=standard status=ok feedback_ms=180 house_ms=90 get_file_ms=100 download_ms=140 ai_ms=1600 preview_ms=150 total_ms=1990
```

### Como ler

- Etapas paralelas **não devem ser somadas**.
- Os campos aparecem na ordem em que cada etapa termina, não na ordem da tabela.
- Campos de etapas não executadas são omitidos.
- `deep` reaproveita o aviso do botão; seu `total_ms` começa depois desse aviso.
- `error`, `invalid_house` e `incomplete` indicam saídas sem preview válido.
- Não há medição do upload no celular nem da renderização no aplicativo.
