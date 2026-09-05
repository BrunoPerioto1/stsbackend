# Planilhamento por áudio

Áudio é uma entrada adicional no bot existente: Telegram voice/audio → Buffer em memória → `gpt-transcribe` → texto → `gpt-5.6-luna` com reasoning `none` → normalização e preview compartilhados com imagem → `planilhar_ts` → `processBetText`.

Receber áudio nunca salva a aposta. Só o clique em **Planilhar** chama o registro existente. Casa ausente/desconhecida ou campos incompletos geram uma lista do que falta, sem botão. A validação de casas usa `resolveHouseId`, sem lista nova.

Antes do preview, a própria chamada Luna formata a fala como bilhete: “Palmeiras contra Corinthians” fica “Palmeiras x Corinthians”; “Rioroberto chuta para o gol” fica “Rioroberto: Chute ao gol”. Preserva nomes, linhas, períodos e condições, sem inventar quantidade de chutes. Não há chamada extra de IA para formatação.

As regras do prompt padronizam vitória como “Palmeiras ML” e linhas como “Palmeiras: Mais de 1,5 gols” ou “Palmeiras: Menos de 9,5 escanteios”, usando Mais de/Menos de em vez de Over/Under. Derrota explícita fica “Palmeiras perde”; não perder, empate e empate anula não viram ML. Linhas mantêm o valor e a direção originais: 1,5 não vira 1 e mais de 9,5 não vira mais de 10. Linha sem condição clara ou fala ambígua deve retornar mercado nulo; a validação existente bloqueia Planilhar e pede novo áudio. Essa verificação semântica depende do Luna; os testes com mocks não comprovam sua precisão.

O timestamp vem da mensagem original, com a mesma conversão e apresentação em `America/Sao_Paulo` do callback existente. O estado antes do clique continua no texto do preview; não há tabela ou histórico novo. Texto e encaminhamento do grupo de tips mantêm seu comportamento anterior.

## Arquivos

Alterados:

- `src/telegram/telegram.service.ts`: encaminha voice/audio ao fluxo de áudio.
- `src/telegram/bet-text.service.ts`: download, validação de casa e apresentação do preview; imagem também usa o utilitário compartilhado.
- `src/telegram/bet-image.service.ts`: exporta schema/parser e usa o cliente compartilhado.
- `src/module/telegram.module.ts`: registra `BetAudioService`.
- `src/telegram/bet-image.service.spec.ts`: ajusta dependência no mock.
- `package.json`: comando de teste isolado.

Novos:

- `src/telegram/bet-audio.service.ts`: transcrição e interpretação em métodos separados.
- `src/telegram/openai-client.ts`: cliente OpenAI compartilhado e inicializado sob demanda.
- `src/telegram/utils/bet-preview.util.ts`: validação dos campos e preview comum.
- `src/telegram/bet-audio.service.spec.ts`: testes com mocks.
- `scripts/test-bet-audio.ts`: teste local usando os mesmos métodos e prompts.
- `docs/telegram-audio.md`: este guia.

## Teste local

Na raiz do `stsbackend`, configure `OPENAI_API_KEY` no `.env` existente e execute:

```powershell
npm run test:bet-audio -- ./aposta.ogg
```

Esse comando faz chamadas reais à OpenAI, mostra transcrição, JSON, usage do Luna e tempos. Não acessa Telegram nem registra aposta. Evite compartilhar a saída se o áudio contiver dados pessoais.

Verificações sem chamadas externas:

```powershell
npx tsc --noEmit --incremental false
npm run build
npm test -- --runInBand
npx eslint "{src,apps,libs,test}/**/*.ts"
```

Os testes usam respostas simuladas: verificam encaminhamento, upload OGG, parâmetros, normalização, ausência de registro automático, campos faltantes e falhas. Não medem precisão real de transcrição ou interpretação; valide isso com áudios reais no comando acima.

Validação desta entrega: 34 testes passando, typecheck e build aprovados. Os arquivos novos passam no lint; nos arquivos alterados, a comparação com `HEAD` não identificou novos diagnósticos. O lint geral ainda falha por problemas preexistentes no repositório.

## Teste pelo Telegram

Depois de publicar esta versão pelo processo habitual, abra a conversa privada com o bot e envie um voice ou arquivo de áudio. Exemplo:

> Casa Ginga, Fluminense contra Vasco, futebol, Hulk marcar ou dar assistência, odd três, stake quatorze reais e oitenta e três.

Confira casa, jogo, mercado, odd 3 e stake 14,83 no preview. Confirme que a aposta só aparece no sistema após clicar em **Planilhar**. O horário deve ser o envio do áudio.

Envie outro áudio sem casa ou odd: deve listar campos faltantes e não mostrar Planilhar. Teste também silêncio e arquivo inválido: a resposta deve ser amigável. O grupo especial de tips continua seguindo suas regras anteriores; use a conversa privada para validar este fluxo.

## Formatos, desempenho e logs

- Até 20 MiB (mensagem ao usuário: 20 MB), verificados pelo tamanho informado e pelos bytes efetivamente baixados. OGG/Opus de voice é enviado como `voice.ogg`, `audio/ogg`, sem conversão. Arquivos suportados: ogg, mp3, mp4, mpeg, mpga, m4a, wav, webm e flac.
- Download por `fetch` com timeout de 10 s; transcrição com 20 s; interpretação com 15 s, sem retries automáticos nessas duas chamadas. Operações do Telegram também entram no tempo total. O `maxDuration` existente de 60 s não foi alterado.
- `[BET_AUDIO_DOWNLOAD]`: tempo de obtenção do arquivo e download.
- `[BET_AUDIO_TRANSCRIBE]`: modelo, duração do áudio quando disponível, tempo da chamada e status.
- `[BET_AUDIO_PARSE]`: tokens de entrada/cache/saída/reasoning, tempo e status. Chave estável `bet-audio-parser-v1`, prompt fixo antes da transcrição.
- `[BET_AUDIO_TOTAL]`: tempo total e status; `[BET_AUDIO_ERROR]`: tipo do erro, sem mensagem interna ou stack.

O fluxo novo não persiste áudio nem transcrição, não registra Buffer/base64/transcrição nos logs do backend e usa `store: false` na chamada Luna. Apenas o script local imprime a transcrição. Nenhuma dependência ou infraestrutura foi adicionada.

O callback existente troca o botão para **Planilhado** após concluir. Ele não possui deduplicação persistente para apostas avulsas; esta implementação conserva essa lógica e não garante proteção contra dois cliques simultâneos ou reentrega de callback.

Documentação consultada: [Speech to text](https://developers.openai.com/api/docs/guides/speech-to-text), [GPT-Transcribe](https://developers.openai.com/api/docs/models/gpt-transcribe) e tipos do SDK OpenAI instalado (`audio.transcriptions.create`, `toFile`, `languages`, `keywords` e suporte a OGG).
