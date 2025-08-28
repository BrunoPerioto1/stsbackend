import { Injectable } from '@nestjs/common';
import Groq from 'groq-sdk';
import * as dotenv from 'dotenv';
import { CreateBetDto } from '../infra/dto/new-bet.dto';
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
    const prompt = `Você é um parser de mensagens de apostas.
Receberá um texto e deve devolver APENAS um objeto JSON válido, sem explicações.
NUNCA envolva o JSON em blocos de código (sem crases).

Regras de parsing:

"house_id": OBRIGATÓRIO! Usar mapeamento fornecido (retorne o número do ID).
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
Casas de aposta cadastradas (mapear nome/variações → ID):
1. 1 PRA 1
2. 1XBET
3. 4PLAY
4. 4WIN
5. 5G
6. 6R
7. 6Z
8. 7GAMES
9. 7K
10. 9D
11. 9F
12. A247
13. AFUN
14. AI
15. ALFA BET
16. APOSTA GANHA
17. APOSTA BET
18. APOSTA1
19. APOSTAMAX
20. APOSTATUDO
21. APOSTAR
22. APOSTOU
23. ARENAPLUS
24. AVIAOBET
25. B1 BET
26. B2XBET
27. BACANAPLAY
28. BANDBET
29. BATEU BET
30. BAU BINGO
31. BET AKI
32. BET APP
33. BET DA SORTE
34. BET DO MILHÃO
35. BET GORILLAS
36. BET SUL
37. BET VIP
38. BET.BET
39. BET365
40. BET4
41. BETBOO
42. BETBOOM
43. BETBRA
44. BETBUFFALOS
45. BETCAIXA
46. BETCOPA
47. BETESPECIAL
48. BETESPORTE
49. BETFALCONS
50. BETFAST
51. BETFAIR
52. BETFUSION
53. BETMGM
54. BETNACIONAL
55. BETOU
56. BETPARK
57. BETANO
58. BETSSON
59. BETWARRIOR
60. BIG
61. BINGOPLUS
62. BLAZE
63. BOLSA DE APOSTA
64. BRASIL BET
65. BRASIL DA SORTE
66. BRAVO
67. BRAZINO 777
68. BRBET
69. BR4BET
70. BRXBET
71. BULLSBET
72. CASA DE APOSTAS
73. CASSINO
74. CAESARS
75. CBESPORTES
76. CGG
77. DONALDBET
78. DONOSDABOLA
79. ENERGIA
80. ESPORTES DA SORTE
81. ESPORTE 365
82. ESPORTIVA BET
83. ESPORTIVAVIP
84. ESTRELABET
85. F12.BET
86. FAZ O BET
87. FAZ1BET
88. FANBIT
89. FLABET
90. FOG0777
91. FULLTBET
92. FYBET
93. GALERA.BET
94. GAMEPLUS
95. GERALBET
96. GINGABET
97. GOL DE BET
98. H2 BET
99. HILGARDO
100. HILGARDO GAMING
101. HIPERBET
102. JOGA LIMPO
103. JOGÃO
104. JOGO
105. JOGO DE OURO
106. JOGO ONLINE
107. JOGOS
108. JONBET
109. KBET
110. KING PANDA
111. KTO
112. LANCE DE SORTE
113. LÍDERBET
114. LOTTOLAND
115. LOTTU
116. LOTOGREEN
117. LUCK.BET
118. LUVA.BET
119. MAGICJACKPOT
120. MATCHBOOK
121. MAXIMABET
122. MCGAMES
123. MEGABET
124. MEGAPOSTA
125. MERIDIAN
126. MGM
127. MMA
128. MONTECARLOS
129. MONTECARLOSBET
130. MULTIBET
131. NETPIX
132. NOSSABET
133. NOVIBET
134. ONABET
135. OLEYBET
136. P9
137. PAGOL
138. PAPIGAMES
139. PIN
140. PINNACLE
141. PITACO
142. PIXBET
143. PLAYUZU
144. PQ777
145. QGBET
146. R7
147. RDP
148. REALS
149. REI DO PITACO
150. RICOBET
151. RIVALO
152. SEGURO BET
153. SEUBET
154. SORTE ONLINE
155. SORTENABET
156. SPIN
157. SPORTINGBET
158. SPORTYBET
159. STAKE
160. STARTBET
161. SUPER
162. SUPERBET
163. SUPREMABET
164. TELE SENA BET
165. TIGER
166. TIVOBET
167. TRADICIONAL
168. ULTRABET
169. UPBETBR
170. UX
171. VBET
172. VERA
173. VERSUSBET
174. VERTBET
175. VIVARO
176. VIVASORTE
177. VS-VERSUS
178. VUPI
179. WJCASINO
180. XBET CAIXA

Mensagem:
${message}`;

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
