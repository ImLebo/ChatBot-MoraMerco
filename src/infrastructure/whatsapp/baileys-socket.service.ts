import makeWASocket, {
  DisconnectReason,
  WASocket,
  proto,
  Browsers,
  generateWAMessageFromContent,
  normalizeMessageContent,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import fs from 'fs';
import { AuthStateService } from './auth-state.service.js';
import { QrService } from './qr.service.js';
import { IMessageHandler, IMessageSender, IButtonOption } from '../../domain/services/message-handler.interface.js';
import { NormalizedMessage } from '../../domain/models/message.model.js';
import { config } from '../../config/env.config.js';

export class BaileysSocketService implements IMessageSender {
  private socket: WASocket | null = null;
  private isConnecting: boolean = false;
  private readonly groupNameCache = new Map<string, string>();

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

        if (config.showGroupMessages) {
          this.listAllParticipatingGroups().catch(() => {});
        }
      }
    });

    // 3. Actualización de metadatos de grupos
    this.socket.ev.on('groups.update', (updates) => {
      for (const update of updates) {
        if (update.id && update.subject) {
          this.groupNameCache.set(update.id, update.subject);
        }
      }
    });

    // 4. Captura y normalización de mensajes entrantes
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

        // Si es de grupo, resolver el nombre del grupo para enriquecer la visualización
        if (normalized.isGroup && this.socket) {
          const cached = this.groupNameCache.get(normalized.remoteJid);
          if (cached) {
            normalized.groupName = cached;
          } else {
            try {
              const meta = await this.socket.groupMetadata(normalized.remoteJid);
              if (meta?.subject) {
                this.groupNameCache.set(normalized.remoteJid, meta.subject);
                normalized.groupName = meta.subject;
              }
            } catch {
              // Silencioso si no se pueden obtener metadatos (e.g. sin permisos o offline)
            }
          }
        }

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

    // Si la opción de ver grupos está desactivada, ignoramos por completo
    if (isGroup && !config.showGroupMessages) {
      return null;
    }

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
    // 6. Mensaje multimedia con pie de foto (Caption) o descripción de archivo si es grupo
    else if (messageContent.imageMessage) {
      text = messageContent.imageMessage.caption || (isGroup ? '📷 [Foto sin texto]' : '');
    } else if (messageContent.videoMessage) {
      text = messageContent.videoMessage.caption || (isGroup ? '🎥 [Video sin texto]' : '');
    } else if (messageContent.audioMessage) {
      text = isGroup ? '🎵 [Nota de voz / Audio]' : '';
    } else if (messageContent.stickerMessage) {
      text = isGroup ? '🏷️ [Sticker]' : '';
    } else if (messageContent.documentMessage) {
      text = messageContent.documentMessage.caption || (isGroup ? `📄 [Documento: ${messageContent.documentMessage.fileName || 'archivo'}]` : '');
    } else if (messageContent.contactMessage) {
      text = isGroup ? `👤 [Contacto: ${messageContent.contactMessage.displayName || ''}]` : '';
    }
    // 7. Voto en Encuesta Interactiva (Poll)
    else if (messageContent.pollUpdateMessage) {
      text = 'CONFIRMAR';
    }

    const trimmedText = text.trim();
    if (!trimmedText) return null;

    // Extraer el número telefónico del remitente
    // En grupos, el remitente real viene en participant; en privado, en remoteJid
    const participantJid = isGroup
      ? (raw.key.participant || (raw as any).participant || remoteJid)
      : remoteJid;

    const senderNumber = participantJid.split('@')[0].split(':')[0];
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
    if (recipientJid.endsWith('@g.us') && recipientJid !== config.whatsappSalesGroupJid) {
      console.warn(`🛑 [Seguridad] Envío bloqueado: No se envían mensajes a grupos no autorizados (${recipientJid})`);
      return;
    }
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
    if (recipientJid.endsWith('@g.us')) {
      console.warn(`🛑 [Seguridad] Envío bloqueado: No se envían mensajes a grupos (${recipientJid})`);
      return;
    }
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

  public async sendImageMessage(recipientJid: string, imagePath: string, caption?: string): Promise<void> {
    if (recipientJid.endsWith('@g.us') && recipientJid !== config.whatsappSalesGroupJid) {
      console.warn(`🛑 [Seguridad] Envío bloqueado: No se envían mensajes a grupos no autorizados (${recipientJid})`);
      return;
    }
    if (!this.socket) {
      throw new Error('Socket no inicializado');
    }
    if (fs.existsSync(imagePath)) {
      const buffer = fs.readFileSync(imagePath);
      const result = await this.socket.sendMessage(recipientJid, {
        image: buffer,
        caption: caption || '',
      });
      if (result?.key?.id) {
        this.registerBotSentMessage(result.key.id);
      }
    } else {
      await this.sendTextMessage(recipientJid, caption || '');
    }
  }

  public async sendTypingState(recipientJid: string): Promise<void> {
    if (!this.socket || recipientJid.endsWith('@g.us')) return;
    try {
      await this.socket.sendPresenceUpdate('composing', recipientJid);
    } catch {
      // Ignorar fallos transitorios en presencia
    }
  }

  /**
   * Consulta y lista en consola todos los grupos en los que participa el número, con sus respectivos IDs
   */
  public async listAllParticipatingGroups(): Promise<void> {
    if (!this.socket) return;
    try {
      const groups = await this.socket.groupFetchAllParticipating();
      console.log('--- GRUPOS DE WHATSAPP DISPONIBLES ---');
      for (const [id, metadata] of Object.entries(groups)) {
        this.groupNameCache.set(id, metadata.subject);
        console.log(`[GRUPO] "${metadata.subject}" -> ID: ${id}`);
      }
      console.log('--------------------------------------');
    } catch (err) {
      console.warn('⚠️ No se pudieron listar los grupos participantes:', err);
    }
  }
}
