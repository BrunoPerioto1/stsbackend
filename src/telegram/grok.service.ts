import { Injectable } from '@nestjs/common';
import Groq from 'groq-sdk';
import * as dotenv from 'dotenv';
import { HouseService } from '../house/house.service';
import stringSimilarity from 'string-similarity';
import { normalizeName } from '../common/utils/bet.utils';
dotenv.config();

@Injectable()
export class GrokService {
  private groq: Groq;

  constructor(private readonly houseService: HouseService) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error('❌ GROQ_API_KEY não definido no .env');

    this.groq = new Groq({ apiKey });
  }

  private extractJson(text: string): string | null {
    if (!text) return null;

    const stripped = text
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();

    try {
      JSON.parse(stripped);
      return stripped;
    } catch {}

    const match = stripped.match(/\{[\s\S]*\}/);
    if (match) {
      const candidate = match[0];
      try {
        JSON.parse(candidate);
        return candidate;
      } catch {}
    }

    return null;
  }

  async resolveHouseId(message: string): Promise<number | null> {
    if (!message) return null;
    const houseMatch = message.match(/🏠\s*(.+)/);
    if (!houseMatch) return null;

    const houseName = normalizeName(houseMatch[1]);
    if (!houseName) return null;

    const houses = await this.houseService.getAllHouses();
    if (!houses?.length) return null;

    const normalizedHouses = houses
      .map((h) => ({ id: h.id, name: h.name, normalized: normalizeName(h.name) }))
      .filter((h) => !!h.normalized);

    if (!normalizedHouses.length) return null;

    const names = normalizedHouses.map((h) => h.normalized);
    const { bestMatch, bestMatchIndex } = stringSimilarity.findBestMatch(houseName, names);

    if (bestMatch.rating >= 0.8) {
      return normalizedHouses[bestMatchIndex].id;
    }

    return null;
  }

  async parseBetMessage(message: string, houseId: number | null): Promise<any> {
    const prompt = `Você é um parser de mensagens de apostas.
Receberá um texto e deve devolver APENAS um objeto JSON válido, sem explicações.
NUNCA envolva o JSON em blocos de código (sem crases).

Regras de parsing:

"houseId": use este valor: ${houseId ?? "null"}.
"game": texto após 🆚.
"sport": texto após ⚽️.
"market": texto após 📌.
"odd": número após 🏷.
"free": true/false dependendo do 🆓.

IMPORTANTE SOBRE STAKE:

NÃO calcule a stake.

Extraia apenas:

"percent": o número (%) após 🛑 (ex.: 5 para 5%).
"limit": o valor numérico após 🚦, se existir (ex.: 20).
O cálculo da stake será feito no servidor.

Mensagem:
${message}`;

    const chatCompletion = await this.groq.chat.completions.create({
      model: 'openai/gpt-oss-120b',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
      top_p: 1,
      stream: false,
      // max_tokens: 7000,
    });

    const aiText = chatCompletion.choices[0]?.message?.content || '';

    const extracted = this.extractJson(aiText);

    try {
      const obj = JSON.parse(extracted ?? aiText);
      console.log('📊 JSON Gerado pelo Groq:', JSON.stringify(obj, null, 2));
      return obj;
    } catch {
      console.log('📊 JSON retornado pelo Groq (não é JSON válido):', aiText);
      return aiText;
    }
  }
}
