import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export interface AppConfig {
  nodeEnv: string;
  sessionsDir: string;
  geminiApiKey?: string;
  geminiModel: string;
}

export const config: AppConfig = {
  nodeEnv: process.env.NODE_ENV || 'development',
  sessionsDir: process.env.SESSIONS_DIR || path.resolve(process.cwd(), 'sessions'),
  geminiApiKey: process.env.GEMINI_API_KEY,
  geminiModel: process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite',
};
