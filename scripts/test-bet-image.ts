// Testa o extrator de print isoladamente, sem passar pelo Telegram:
//   npm run test:bet-image -- ./aposta.png
// Usa exatamente o mesmo BetImageService de produção (mesmo prompt, mesmo
// schema, mesmo log de usage) — não duplique a chamada da OpenAI aqui.
import { readFileSync } from 'fs';
import { extname, resolve } from 'path';
import * as dotenv from 'dotenv';
import { BetImageService } from '../src/telegram/bet-image.service';

dotenv.config();

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('uso: npm run test:bet-image -- ./aposta.png');
    process.exit(1);
  }

  const path = resolve(file);
  const mimeType = extname(path).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg';
  const startedAt = Date.now();

  const result = await new BetImageService().extractBetFromImage({
    imageBuffer: readFileSync(path),
    mimeType,
  });

  console.log(JSON.stringify(result, null, 2));
  console.log(`total (com IO): ${((Date.now() - startedAt) / 1000).toFixed(2)}s`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
