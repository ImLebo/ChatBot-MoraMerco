import { NormalizedMessage } from '../models/message.model.js';

export interface IButtonOption {
  id: string;
  displayText: string;
}

export interface IMessageSender {
  sendTextMessage(recipientJid: string, text: string): Promise<void>;
  sendInteractiveButtons(
    recipientJid: string,
    bodyText: string,
    buttons: IButtonOption[],
    headerTitle?: string,
    footerText?: string
  ): Promise<void>;
  sendImageMessage?(recipientJid: string, imagePath: string, caption?: string): Promise<void>;
  sendTypingState(recipientJid: string): Promise<void>;
}

export interface IMessageHandler {
  handleIncomingMessage(message: NormalizedMessage, sender: IMessageSender): Promise<void>;
}
