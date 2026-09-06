import OpenAI from 'openai';

let client: OpenAI | undefined;

export function getOpenAIClient(): OpenAI {
  if (!client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY_AUSENTE');
    client = new OpenAI({ apiKey });
  }
  return client;
}
