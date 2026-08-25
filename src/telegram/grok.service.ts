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
    let rawHouseName = houseMatch?.[1];

    if (!rawHouseName) {
      // Formato SOBRECARGA/AVISO: sem emoji — o nome da casa é a primeira
      // linha não vazia logo após o cabeçalho SOBRECARGA/AVISO.
      const lines = message.split('\n').map((l) => l.trim()).filter(Boolean);
      const headerIndex = lines.findIndex((l) => /^(SOBRECARGA|AVISO)$/i.test(l));
      if (headerIndex !== -1) rawHouseName = lines[headerIndex + 1];
    }
    if (!rawHouseName) return null;

    const houseName = normalizeName(rawHouseName);
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

A mensagem pode vir em um de dois formatos. Identifique qual é e extraia
os campos de acordo.

FORMATO 1 (com emojis):
"game": texto após 🆚.
"sport": texto após ⚽️.
"market": texto após 📌.
"odd": número após 🏷.
"free": true/false dependendo do 🆓.

FORMATO 2 (alerta "SOBRECARGA" ou "AVISO", sem emojis — cada campo é uma
linha própria, nesta ordem, começando logo após o cabeçalho SOBRECARGA/AVISO
e a linha em branco seguinte):
linha 1: nome da casa de apostas (ignore, o houseId já foi resolvido).
linha 2: "game" (os times/confronto).
linha 3: "sport" (o esporte).
linha 4: "market" (o mercado da aposta).
linha 5: "odd" (só o número).
linha 6: "Limite da aposta: R$X" (ignore, calculado no servidor).
linha 7: percentual sozinho, ex. "0,75%" (ignore, calculado no servidor).
linha 8: valor em R$ (ignore, calculado no servidor).
linha 9: "Sim" ou "Não" → "free": true se "Sim", false se "Não".

"houseId": use este valor: ${houseId ?? "null"}.

IMPORTANTE SOBRE STAKE:

NÃO calcule a stake.

Extraia apenas:

"percent": o número (%) indicado na mensagem (ex.: 5 para 5%, tanto após 🛑 quanto numa linha sozinha tipo "0,75%").
"limit": o valor numérico do limite da aposta, se existir (ex.: após 🚦 ou em "Limite da aposta: R$20").
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
