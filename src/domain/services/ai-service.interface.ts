export interface IAiService {
  generateResponse(senderId: string, userMessage: string, senderName?: string): Promise<string>;
  recordExchange?(senderId: string, userMessage: string, botReply: string): void;
}
