export interface NormalizedMessage {
  id: string;
  remoteJid: string;
  senderNumber: string;
  senderName?: string;
  text: string;
  fromMe: boolean;
  isGroup: boolean;
  groupName?: string;
  timestamp: number;
}

export interface OutgoingMessage {
  recipientJid: string;
  text: string;
}

export type ChatFlowStage =
  | 'NEW'
  | 'AWAITING_PRODUCT'
  | 'AWAITING_APPLIANCE'
  | 'PRICING_SENT'
  | 'DATA_REQUESTED'
  | 'CONFIRMATION_PENDING'
  | 'ORDER_CONFIRMED';

export interface ChatState {
  stage: ChatFlowStage;
  activeProductId?: string;
  selectedComboId?: string;
  updatedAt?: number;
}
