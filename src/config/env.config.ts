import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export interface AppConfig {
  nodeEnv: string;
  sessionsDir: string;
  geminiApiKey?: string;
  geminiModel: string;
  geminiFallbackModel: string;
  showGroupMessages: boolean;
  whatsappSalesGroupJid?: string;
  WHATSAPP_SALES_GROUP_JID?: string;
  googleSheetsSpreadsheetId?: string;
  googleSheetsCredentialsPath?: string;
  googleSheetsTabName?: string;
}

const salesGroup = process.env.WHATSAPP_SALES_GROUP_JID?.trim();

export const config: AppConfig = {
  nodeEnv: process.env.NODE_ENV || 'development',
  sessionsDir: process.env.SESSIONS_DIR || path.resolve(process.cwd(), 'sessions'),
  geminiApiKey: process.env.GEMINI_API_KEY,
  geminiModel: process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite',
  geminiFallbackModel: process.env.GEMINI_FALLBACK_MODEL || 'gemini-2.5-flash-lite',
  showGroupMessages: process.env.SHOW_GROUP_MESSAGES !== 'false',
  whatsappSalesGroupJid: salesGroup,
  WHATSAPP_SALES_GROUP_JID: salesGroup,
  googleSheetsSpreadsheetId: process.env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim() || '1FoOkfHEfpvejezbiD4X1uFneP3akZu0xFK4lEMQFFrg',
  googleSheetsCredentialsPath: process.env.GOOGLE_SHEETS_CREDENTIALS_PATH?.trim() || './credentials/backend-lebo-d5e87ca58da9.json',
  googleSheetsTabName: process.env.GOOGLE_SHEETS_TAB_NAME?.trim() || 'Hoja 1',
};

export const env = config;


