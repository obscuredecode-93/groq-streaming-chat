import dotenv from 'dotenv';
dotenv.config();

if (!process.env.GROQ_API_KEY) {
  console.error('ERROR: GROQ_API_KEY is not set in .env');
  process.exit(1);
}

export const config = {
  port: parseInt(process.env.PORT) || 3000,
  groqApiKey: process.env.GROQ_API_KEY,
  maxTokens: parseInt(process.env.MAX_TOKENS) || 1024,
  model: process.env.MODEL || 'llama-3.1-8b-instant',
  rateLimitWindow: 60 * 1000,
  rateLimitMax: 10,
  maxRetries: 3,
};
