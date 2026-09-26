import { BET_EXTRACTION_RULES, type RawBetData } from '../bet/bet-normalization';
import { Injectable, Logger } from '@nestjs/common';
import Groq from 'groq-sdk';

@Injectable()
export class GrokService {
  private readonly logger = new Logger(GrokService.name);

  private groq?: Groq;

  // Cliente criado no primeiro uso. Antes o construtor exigia GROQ_API_KEY e,
  // sem ela, a API inteira não subia — inclusive rotas que nunca usam o Groq.
  // Só o parse de texto fora do padrão precisa dele.
  private client(): Groq {
    if (!this.groq) {
      const apiKey = process.env.GROQ_API_KEY;
      if (!apiKey) throw new Error('GROQ_API_KEY_AUSENTE');
      this.groq = new Groq({ apiKey });
    }
    return this.groq;
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
    } catch {
      // Não é JSON puro: tenta achar um objeto dentro do texto.
    }

    const match = stripped.match(/\{[\s\S]*\}/);
    if (match) {
      const candidate = match[0];
      try {
        JSON.parse(candidate);
        return candidate;
      } catch {
        // Nem o trecho entre chaves é JSON: desiste abaixo.
      }
    }

    return null;
  }

  async parseBetMessage(message: string, houseId: number | null): Promise<RawBetData | null> {
    const prompt = `Você é um parser de mensagens de apostas.
${BET_EXTRACTION_RULES}
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

    const chatCompletion = await this.client().chat.completions.create({
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
      return JSON.parse(extracted ?? aiText) as RawBetData;
    } catch {
      this.logger.warn(
        '[VALIDATION_FAILED] stage=extraction code=IA_JSON_INVALIDO',
      );
      throw new Error('IA_JSON_INVALIDO');
    }
  }
}
