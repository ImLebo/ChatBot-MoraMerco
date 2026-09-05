import makeWASocket, {
  DisconnectReason,
  WASocket,
  proto,
  Browsers,
  generateWAMessageFromContent,
  normalizeMessageContent,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import { AuthStateService } from './auth-state.service.js';
import { QrService } from './qr.service.js';
import { IMessageHandler, IMessageSender, IButtonOption } from '../../domain/services/message-handler.interface.js';
import { NormalizedMessage } from '../../domain/models/message.model.js';

export class BaileysSocketService implements IMessageSender {
  private socket: WASocket | null = null;
  private isConnecting: boolean = false;

  constructor(
    private readonly authService: AuthStateService,
    private readonly qrService: QrService,
    private readonly messageHandler: IMessageHandler
  ) {}

  private readonly botSentMessageIds = new Set<string>();

  private registerBotSentMessage(id?: string | null): void {
    if (!id) return;
    this.botSentMessageIds.add(id);
    if (this.botSentMessageIds.size > 2000) {
      const first = this.botSentMessageIds.keys().next().value;
      if (first) this.botSentMessageIds.delete(first);
    }
  }

  public async connect(): Promise<void> {
    if (this.isConnecting) return;
    this.isConnecting = true;

    try {
      const { state, saveCreds } = await this.authService.getAuthState();

      this.socket = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        browser: Browsers.ubuntu('Desktop'),
        syncFullHistory: false,
      });

      this.registerSocketEvents(saveCreds);
    } catch (error) {
      console.error('❌ Error al inicializar el socket de WhatsApp:', error);
      this.isConnecting = false;
      this.scheduleReconnect(5000);
    }
  }

  private registerSocketEvents(saveCreds: () => Promise<void>): void {
    if (!this.socket) return;

    // 1. Guardado de credenciales
    this.socket.ev.on('creds.update', async () => {
      await saveCreds();
    });

    // 2. Manejo de conexión y desconexión (Ciclo de vida del WebSocket)
    this.socket.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        this.qrService.displayQr(qr);
      }

      if (connection === 'close') {
        this.isConnecting = false;
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        console.log(`⚠️ Conexión cerrada. Código de estado: ${statusCode}. Reconectar: ${shouldReconnect}`);

        if (shouldReconnect) {
          this.scheduleReconnect(3000);
        } else {
          console.log('🔒 La sesión fue cerrada desde el teléfono. Limpiando credenciales y solicitando nuevo QR...');
          await this.authService.clearSession();
          this.scheduleReconnect(2000);
        }
      } else if (connection === 'open') {
        this.isConnecting = false;
        console.log('\n======================================================');
        console.log('✅ ¡CONECTADO CON ÉXITO A WHATSAPP WEB!');
        console.log('🤖 El bot está activo y escuchando mensajes en tiempo real.');
        console.log('======================================================');
      }
    });

    // 3. Captura y normalización de mensajes entrantes
    this.socket.ev.on('messages.upsert', async (upsert) => {
      // 'notify' indica mensajes nuevos en tiempo real
      if (upsert.type !== 'notify') return;

      for (const rawMessage of upsert.messages) {
        // Ignorar si fue un mensaje enviado por nuestro propio bot (evita bucles)
        if (rawMessage.key?.id && this.botSentMessageIds.has(rawMessage.key.id)) {
          continue;
        }

        const normalized = this.normalizeMessage(rawMessage);
        if (!normalized) continue;

        try {
          await this.messageHandler.handleIncomingMessage(normalized, this);
        } catch (err) {
          console.error(`❌ Error procesando mensaje de [${normalized.senderNumber}]:`, err);
        }
      }
    });
  }

  private scheduleReconnect(delayMs: number): void {
    console.log(`🔄 Reintentando conexión en ${delayMs / 1000}s...`);
    setTimeout(() => {
      this.connect();
    }, delayMs);
  }

  private normalizeMessage(raw: proto.IWebMessageInfo): NormalizedMessage | null {
    // Ignorar mensajes sin clave
    if (!raw.key) return null;

    const remoteJid = raw.key.remoteJid;
    if (!remoteJid) return null;

    // Ignorar historias / estados de WhatsApp
    if (remoteJid === 'status@broadcast') return null;

    // Detectar si es mensaje de grupo
    const isGroup = remoteJid.endsWith('@g.us');

    // Por defecto para dropshipping, ignoramos grupos para no responder en comunidades
    if (isGroup) return null;

    // Normalizar contenido si viene envuelto en viewOnce, ephemeral, etc.
    const messageContent = normalizeMessageContent(raw.message);
    if (!messageContent) return null;

    let text = '';

    // 1. Mensaje de texto directo o extendido
    if (messageContent.conversation) {
      text = messageContent.conversation;
    } else if (messageContent.extendedTextMessage?.text) {
      text = messageContent.extendedTextMessage.text;
    }
    // 2. Respuesta de Botón Nativo Interactivo (Native Flow Buttons)
    else if (messageContent.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson) {
      try {
        const params = JSON.parse(messageContent.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson);
        text = params.id || params.display_text || params.name || '';
      } catch {
        text = messageContent.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson;
      }
    }
    // 3. Respuesta de Botones Clásicos (ButtonsResponseMessage)
    else if (messageContent.buttonsResponseMessage?.selectedButtonId) {
      text = messageContent.buttonsResponseMessage.selectedButtonId;
    } else if (messageContent.buttonsResponseMessage?.selectedDisplayText) {
      text = messageContent.buttonsResponseMessage.selectedDisplayText;
    }
    // 4. Respuesta de Botón de Plantilla (TemplateButtonReplyMessage)
    else if (messageContent.templateButtonReplyMessage?.selectedId) {
      text = messageContent.templateButtonReplyMessage.selectedId;
    } else if (messageContent.templateButtonReplyMessage?.selectedDisplayText) {
      text = messageContent.templateButtonReplyMessage.selectedDisplayText;
    }
    // 5. Respuesta a Encuesta o Botón en Lista (ListResponseMessage)
    else if (messageContent.listResponseMessage?.singleSelectReply?.selectedRowId) {
      text = messageContent.listResponseMessage.singleSelectReply.selectedRowId;
    }
    // 6. Mensaje multimedia con pie de foto (Caption)
    else if (messageContent.imageMessage?.caption) {
      text = messageContent.imageMessage.caption;
    } else if (messageContent.videoMessage?.caption) {
      text = messageContent.videoMessage.caption;
    }
    // 7. Voto en Encuesta Interactiva (Poll)
    else if (messageContent.pollUpdateMessage) {
      text = 'CONFIRMAR';
    }

    const trimmedText = text.trim();
    if (!trimmedText) return null;

    // Extraer el número telefónico sin sufijo @s.whatsapp.net ni @lid
    const senderNumber = remoteJid.split('@')[0];
    const senderName = raw.pushName || undefined;
    const timestamp = typeof raw.messageTimestamp === 'number'
      ? raw.messageTimestamp
      : Number(raw.messageTimestamp || Date.now() / 1000);

    return {
      id: raw.key.id || `${Date.now()}`,
      remoteJid,
      senderNumber,
      senderName,
      text: trimmedText,
      fromMe: Boolean(raw.key.fromMe),
      isGroup,
      timestamp,
    };
  }

  // Métodos de la interfaz IMessageSender
  public async sendTextMessage(recipientJid: string, text: string): Promise<void> {
    if (!this.socket) {
      throw new Error('Socket no inicializado');
    }
    const result = await this.socket.sendMessage(recipientJid, { text });
    if (result?.key?.id) {
      this.registerBotSentMessage(result.key.id);
    }
  }

  public async sendInteractiveButtons(
    recipientJid: string,
    bodyText: string,
    buttons: IButtonOption[],
    headerTitle?: string,
    footerText?: string
  ): Promise<void> {
    if (!this.socket) {
      throw new Error('Socket no inicializado');
    }

    // 1. Enviar SIEMPRE el texto completo primero con el resumen.
    // Esto garantiza 100% que el cliente lo reciba en su pantalla sin riesgo de que WhatsApp lo oculte.
    const res1 = await this.socket.sendMessage(recipientJid, { text: bodyText });
    if (res1?.key?.id) {
      this.registerBotSentMessage(res1.key.id);
    }

    // 2. Enviar el botón interactivo de confirmación mediante Poll de WhatsApp (100% compatible con móviles)
    try {
      const pollOptions = buttons.map((btn) => btn.displayText);
      const res2 = await this.socket.sendMessage(recipientJid, {
        poll: {
          name: '👇 Toca la opción para confirmar tu pedido:',
          values: pollOptions,
          selectableCount: 1,
        },
      });
      if (res2?.key?.id) {
        this.registerBotSentMessage(res2.key.id);
      }
      console.log(`🔘 Botón interactivo de confirmación enviado a +${recipientJid.split('@')[0]}`);
    } catch (error) {
      console.warn('⚠️ No se pudo enviar el botón interactivo secundario:', error);
    }
  }

  public async sendTypingState(recipientJid: string): Promise<void> {
    if (!this.socket) return;
    try {
      await this.socket.sendPresenceUpdate('composing', recipientJid);
    } catch {
      // Ignorar fallos transitorios en presencia
    }
  }
}
