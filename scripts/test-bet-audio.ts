import 'dotenv/config';
import { readFile, stat } from 'node:fs/promises';
import { basename } from 'node:path';
import {
  BetAudioService,
  MAX_AUDIO_BYTES,
} from '../src/telegram/bet-audio.service';

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error('Uso: npm run test:bet-audio -- ./aposta.ogg');
  if ((await stat(file)).size > MAX_AUDIO_BYTES)
    throw new Error('Áudio maior que 20 MB.');
  const service = new BetAudioService();
  const startedAt = performance.now();
  const transcript = await service.transcribeBetAudio({
    audioBuffer: await readFile(file),
    filename: basename(file),
  });
  const transcribedAt = performance.now();
  console.log('\n--- TRANSCRIÇÃO ---\n' + transcript);
  const result = await service.extractBetFromTranscript(transcript);
  const finishedAt = performance.now();
  console.log('\n--- EXTRAÇÃO ---\n' + JSON.stringify(result, null, 2));
  console.log(
    `\n--- TEMPOS ---\nTranscribe (com leitura): ${(transcribedAt - startedAt).toFixed(0)}ms\nParse: ${(finishedAt - transcribedAt).toFixed(0)}ms\nTotal: ${(finishedAt - startedAt).toFixed(0)}ms`,
  );
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : 'Falha no teste de áudio',
  );
  process.exitCode = 1;
});
