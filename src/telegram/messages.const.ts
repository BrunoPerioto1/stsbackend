// Cabeçalho do prompt de "Editar" — carrega o messageId + tipo (texto/mídia)
// direto no texto da mensagem, sem precisar de estado em memória (o processo
// roda em serverless, então nada garante que a mesma instância trate o clique
// em Editar e a resposta com a nova odd). O texto original vem embutido logo
// depois da primeira linha em branco — mandado num <blockquote expandable>
// pra não poluir a tela, mas o conteúdo puro continua ali pra reconstruir.
export const EDIT_PROMPT_HEADER_RE = /^✏️ Editar aposta #(\d+)\|(t|p)\|(\d*)\n/;
export const EDIT_PROMPT_INSTRUCTIONS =
  'Digite o que quer mudar (um de cada vez):\n' +
  '• odd 3.50\n' +
  '• limite 60\n' +
  '• casa Superbet Brasil\n' +
  '• 3.50 60 (odd + limite juntos)';

export const UNLINKED_INSTRUCTIONS =
  '❌ Sua conta não está vinculada.\n\n' +
  'Pra vincular:\n' +
  '1️⃣ Entre em https://stsfront.vercel.app/login e faça login\n' +
  '2️⃣ Vá em Perfil → Telegram → "Gerar código de vinculação"\n' +
  '3️⃣ Copie os seis dígitos (valem 5 minutos)\n' +
  '4️⃣ Volte aqui e envie: /vincular 123456';
