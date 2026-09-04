export interface NormalizedMessage {
  id: string;
  remoteJid: string;
  senderNumber: string;
  senderName?: string;
  text: string;
  fromMe: boolean;
  isGroup: boolean;
  timestamp: number;
}

export interface OutgoingMessage {
  recipientJid: string;
  text: string;
}
