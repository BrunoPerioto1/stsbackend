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

  async parseBetMessage(message: string): Promise<any> {
    const prompt = `
Prompt final para o parser

Você é um parser de mensagens de apostas.
Receberá um texto e deve devolver APENAS um objeto JSON válido, sem explicações.

Regras de parsing:

"casa_id":

OBRIGATÓRIO!

Pegue o texto após 🏠.

Normalize removendo espaços, hífens e diferenças de maiúsculas/minúsculas.

Compare com a lista de casas de aposta cadastradas (abaixo).

Sempre retorne o ID numérico correspondente.

Nunca retorne o nome da casa.

Casas de aposta cadastradas:
2 → 4Play (pode aparecer como "4play")
3 → 7KBet (pode aparecer como "7k", "7k bet")
4 → ApostaGanha (pode aparecer como "apostaganha", "aposta ganha")
5 → ApostaTudo (pode aparecer como "apostatudo", "aposta tudo")
6 → Bateu (pode aparecer como "bateu")
7 → Bet Vera (pode aparecer como "betvera", "bet vera")
8 → Bet365 (pode aparecer como "bet365", "bet-365", "bet 365")
9 → Betano (pode aparecer como "betano")
10 → Betao (pode aparecer como "betao")
11 → BETesporte (pode aparecer como "betesporte", "bet esporte")
12 → Betfair (pode aparecer como "betfair")
13 → Betfast (pode aparecer como "betfast")
14 → Betnacional (pode aparecer como "betnacional", "bet nacional")
15 → BetPix365 (pode aparecer como "betpix", "bet pix 365")
16 → Bolsa De Aposta (pode aparecer como "bolsa de aposta", "bolsaaposta")
17 → Brasil Da Sorte (pode aparecer como "brasil da sorte")
18 → BravoBet (pode aparecer como "bravobet")
19 → BRBET (pode aparecer como "brbet")
20 → CasadeApostas (pode aparecer como "casadeapostas", "casa de apostas")
21 → Cassino (pode aparecer como "cassino")
22 → Esportiva (pode aparecer como "esportiva")
23 → EstrelaBet (pode aparecer como "estrelabet", "estrela bet")
24 → F12 (pode aparecer como "f12")
25 → FullTBet (pode aparecer como "fulltbet", "full t bet")
26 → GoldBet (pode aparecer como "goldbet", "gold bet")
27 → HiperBet (pode aparecer como "hiperbet", "hiper bet")
28 → Jogo de Ouro (pode aparecer como "jogo de ouro")
29 → Lotogreen (pode aparecer como "lotogreen", "loto green")
30 → MC Games (pode aparecer como "mcgames", "mc games")
31 → MMABet (pode aparecer como "mmabet", "mma bet")
32 → Mr. Jack (pode aparecer como "mr jack", "mrjack")
33 → MultiBet (pode aparecer como "multibet", "multi bet")
34 → Novibet (pode aparecer como "novibet")
35 → Pagol (pode aparecer como "pagol")
36 → Pixbet (pode aparecer como "pixbet", "pix bet")
37 → Rei do Pitaco (pode aparecer como "rei do pitaco", "reidopitaco")
38 → SportingBet (pode aparecer como "sportingbet", "sporting bet")
39 → Superbet (pode aparecer como "superbet")
40 → VBet (pode aparecer como "vbet")
41 → Vaidebet (pode aparecer como "vaidebet", "vai de bet")
42 → VeraBet (pode aparecer como "verabet", "vera bet")
43 → XP Bet (pode aparecer como "xpbet", "xp bet")

"jogo": texto após 🆚

"esporte": texto após ⚽️

"mercado": texto após 📌

"odd": número após 🏷

"gratis": true/false dependendo do 🆓

"data_hora": use a data e hora atual em formato ISO (new Date().toISOString())

"stake":

Pegue a % após 🛑 e multiplique por uma banca fixa de 2000.

Se existir 🚦 limite, use o menor entre a stake calculada e o limite.

Ignore completamente qualquer valor 💰 (ele nunca deve ser considerado).

Sempre devolva o valor final em número puro (sem R$, %, ou texto).

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
