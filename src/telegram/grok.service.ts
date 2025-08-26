import { Injectable } from '@nestjs/common';
import Groq from 'groq-sdk';
import * as dotenv from 'dotenv';
import { CreateApostaDto } from '../aposta/dto/create-aposta.dto';
dotenv.config();

@Injectable()
export class GrokService {
  private groq: Groq;

  constructor() {
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

  async parseBetMessage(message: string): Promise<any> {
    const prompt = `
Prompt final para o parser

Você é um parser de mensagens de apostas.
Receberá um texto e deve devolver APENAS um objeto JSON válido, sem explicações.
NUNCA envolva o JSON em blocos de código (sem crases).

Regras de parsing:

"casa_id": OBRIGATÓRIO! Usar mapeamento fornecido (retorne o número do ID).

"jogo": texto após 🆚
"esporte": texto após ⚽️
"mercado": texto após 📌
"odd": número após 🏷
"gratis": true/false dependendo do 🆓

IMPORTANTE SOBRE STAKE:
- NÃO calcule a stake.
- Extraia apenas:
  - "percent": o número (%) após 🛑 (ex.: 5 para 5%).
  - "limite": o valor numérico após 🚦, se existir (ex.: 20).
- O cálculo da stake será feito no servidor.

Casas de aposta cadastradas (mapear nome/variações → ID):
2 → 4Play ("4play")
3 → 7KBet ("7k", "7k bet")
4 → ApostaGanha ("apostaganha", "aposta ganha")
5 → ApostaTudo ("apostatudo", "aposta tudo")
6 → Bateu ("bateu")
7 → Bet Vera ("betvera", "bet vera")
8 → Bet365 ("bet365", "bet-365", "bet 365")
9 → Betano ("betano")
10 → Betao ("betao")
11 → BETesporte ("betesporte", "bet esporte")
12 → Betfair ("betfair")
13 → Betfast ("betfast")
14 → Betnacional ("betnacional", "bet nacional")
15 → BetPix365 ("betpix", "bet pix 365")
16 → Bolsa De Aposta ("bolsa de aposta", "bolsaaposta")
17 → Brasil Da Sorte ("brasil da sorte")
18 → BravoBet ("bravobet")
19 → BRBET ("brbet")
20 → CasadeApostas ("casadeapostas", "casa de apostas")
21 → Cassino ("cassino")
22 → Esportiva ("esportiva")
23 → EstrelaBet ("estrelabet", "estrela bet")
24 → F12 ("f12")
25 → FullTBet ("fulltbet", "full t bet")
26 → GoldBet ("goldbet", "gold bet")
27 → HiperBet ("hiperbet", "hiper bet")
28 → Jogo de Ouro ("jogo de ouro")
29 → Lotogreen ("lotogreen", "loto green")
30 → MC Games ("mcgames", "mc games")
31 → MMABet ("mmabet", "mma bet")
32 → Mr. Jack ("mr jack", "mrjack")
33 → MultiBet ("multibet", "multi bet")
34 → Novibet ("novibet")
35 → Pagol ("pagol")
36 → Pixbet ("pixbet", "pix bet")
37 → Rei do Pitaco ("rei do pitaco", "reidopitaco")
38 → SportingBet ("sportingbet", "sporting bet")
39 → Superbet ("superbet")
40 → VBet ("vbet")
41 → Vaidebet ("vaidebet", "vai de bet")
42 → VeraBet ("verabet", "vera bet")
43 → XP Bet ("xpbet", "xp bet")

Mensagem:
${message}
    `;

    const chatCompletion = await this.groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
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
