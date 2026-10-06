import { ProductConfig } from '../models/product.model.js';

export interface IAiService {
  generateResponse(
    senderId: string,
    userMessage: string,
    senderName?: string,
    product?: ProductConfig
  ): Promise<string>;
  recordExchange?(senderId: string, userMessage: string, botReply: string): void;
}
