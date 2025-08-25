import { Injectable } from '@nestjs/common';
import Groq from 'groq-sdk';
import * as dotenv from 'dotenv';
dotenv.config();

@Injectable()
export class GrokService {
  private groq: Groq;

  constructor() {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error('❌ GROQ_API_KEY não definido no .env');

    this.groq = new Groq({ apiKey });
  }

  async parseBetMessage(message: string): Promise<any> {
    const prompt = `
Você é um parser de mensagens de apostas.
Receberá um texto e deve devolver APENAS um objeto JSON válido, sem explicações.

Regras de parsing:
- "casa": texto após 🏠
- "jogo": texto após 🆚
- "esporte": texto após ⚽️
- "mercado": texto após 📌
- "odd": número após 🏷
- "gratis": true/false dependendo do 🆓
- "stake": deve ser um ÚNICO número, calculado assim:
   1. Pegue a % 🛑 e multiplique por uma banca fixa de 2000.
   2. Se existir 🚦 limite, use o menor entre a stake calculada e o limite.
   3. Ignore completamente qualquer valor 💰, ele nunca deve ser considerado.
   4. Sempre devolva o valor final em número puro (sem R$, %, ou texto).

Mensagem:
${message}
    `;

    const chatCompletion = await this.groq.chat.completions.create({
      model: 'openai/gpt-oss-20b',
      messages: [{ role: 'user', content: prompt }],
    });

    const aiText = chatCompletion.choices[0]?.message?.content || '';

    try {
      const obj = JSON.parse(aiText);
      console.log('📊 JSON Gerado pelo Groq:', JSON.stringify(obj, null, 2));
      return obj;
    } catch {
      console.log('📊 JSON retornado pelo Groq (não é JSON válido):', aiText);
      return aiText;
    }
  }
}
