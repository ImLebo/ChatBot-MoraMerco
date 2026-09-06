import { IMessageHandler, IMessageSender, IButtonOption } from '../../domain/services/message-handler.interface.js';
import { NormalizedMessage } from '../../domain/models/message.model.js';
import { IAiService } from '../../domain/services/ai-service.interface.js';
import { QuickReplyService } from '../../domain/services/quick-reply.service.js';
import { FollowUpService } from './follow-up.service.js';

interface UserMessageQueue {
  messages: NormalizedMessage[];
  sender: IMessageSender;
  timer?: NodeJS.Timeout;
  isProcessing: boolean;
}

interface PausedChatState {
  pausedUntil: number;
  reason: 'COMANDO_MANUAL' | 'INTERVENCION_HUMANA';
}

export class BotCoordinatorService implements IMessageHandler {
  private readonly userQueues = new Map<string, UserMessageQueue>();
  private readonly pausedChats = new Map<string, PausedChatState>();
  private readonly debounceMs: number;

  constructor(
    private readonly aiService: IAiService,
    private readonly quickReplyService: QuickReplyService = new QuickReplyService(),
    private readonly followUpService: FollowUpService = new FollowUpService(45, 3),
    debounceMs: number = 9000
  ) {
    this.debounceMs = debounceMs;
  }

  public async handleIncomingMessage(
    message: NormalizedMessage,
    sender: IMessageSender
  ): Promise<void> {
    const jid = message.remoteJid;

    // 0. Si el mensaje fue enviado por el ASESOR HUMANO (desde su celular o WhatsApp Web)
    if (message.fromMe) {
      this.handleHumanAgentMessage(message);
      return;
    }

    // 1. Si el chat se encuentra pausado por intervención humana, no responder
    if (this.isChatPaused(jid, message)) {
      return;
    }

    // 2. Si el cliente envió cualquier mensaje, pausar inmediatamente cualquier seguimiento pendiente
    this.followUpService.onCustomerReplied(jid);

    let queue = this.userQueues.get(jid);
    if (!queue) {
      queue = {
        messages: [],
        sender,
        isProcessing: false,
      };
      this.userQueues.set(jid, queue);
    }

    // Actualizar el sender con el más reciente
    queue.sender = sender;
    queue.messages.push(message);

    // Si ya estamos procesando una respuesta previa para este chat, el mensaje queda guardado en la cola
    if (queue.isProcessing) {
      console.log(`\n📥 [En cola] Mensaje adicional de ${message.senderName || 'Cliente'} (+${message.senderNumber}): "${message.text}" (se procesará al terminar la respuesta en curso)`);
      return;
    }

    // Si ya existía un temporizador de espera activo, cancelarlo para reiniciar la ventana de debounce
    if (queue.timer) {
      clearTimeout(queue.timer);
      console.log(`⏱️ Mensaje adicional de ${message.senderName || 'Cliente'} (+${message.senderNumber}): "${message.text}". Reiniciando ventana de espera (${this.debounceMs / 1000}s)...`);
    } else {
      console.log(`\n📩 [Recibido] De: ${message.senderName || 'Cliente'} (+${message.senderNumber}): "${message.text}". Esperando ${this.debounceMs / 1000}s por si envía más mensajes...`);
    }

    // Si es un clic de botón interactivo (por ejemplo CONFIRMAR), responder más rápido (1s)
    const isButtonClick = message.text === 'CONFIRMAR';
    const waitTime = isButtonClick ? 1000 : this.debounceMs;

    queue.timer = setTimeout(async () => {
      await this.processMessageBatch(jid);
    }, waitTime);
  }

  /**
   * Procesa mensajes enviados por el dueño/asesor para comandos (#activar, #pausar) o entrega de control automática
   */
  private handleHumanAgentMessage(message: NormalizedMessage): void {
    const text = message.text.trim().toLowerCase();
    const jid = message.remoteJid;

    // 1. Comando para reactivar el bot manualmente
    if (text === '#activar' || text === '#bot' || text === '#reanudar' || text === '#play') {
      this.pausedChats.delete(jid);
      console.log('\n======================================================');
      console.log(`▶️ [COMANDO MANUAL] Bot REACTIVADO en el chat [+${message.senderNumber}]`);
      console.log(`🤖 Maria Paula vuelve a responder automáticamente a este cliente.`);
      console.log('======================================================\n');
      return;
    }

    // 2. Comando para pausar el bot manualmente (ej: #pausar o #pausar 4)
    if (
      text.startsWith('#pausar') ||
      text === '#humano' ||
      text === '#stop' ||
      text === '#desactivar' ||
      text === '#silenciar'
    ) {
      const parts = text.split(' ');
      let hours = 2;
      if (parts.length > 1 && !isNaN(Number(parts[1]))) {
        hours = Math.max(1, Number(parts[1]));
      }

      const pauseDurationMs = hours * 60 * 60 * 1000;
      this.pausedChats.set(jid, {
        pausedUntil: Date.now() + pauseDurationMs,
        reason: 'COMANDO_MANUAL',
      });

      // Cancelar cualquier seguimiento pendiente y limpiar cola
      this.followUpService.onCustomerReplied(jid);
      const queue = this.userQueues.get(jid);
      if (queue?.timer) clearTimeout(queue.timer);
      this.userQueues.delete(jid);

      console.log('\n======================================================');
      console.log(`⏸️ [COMANDO MANUAL] Bot PAUSADO en el chat [+${message.senderNumber}] por ${hours} horas.`);
      console.log(`👤 El bot NO responderá hasta las ${new Date(Date.now() + pauseDurationMs).toLocaleTimeString()} o hasta enviar #activar.`);
      console.log('======================================================\n');
      return;
    }

    // 3. Cualquier otro mensaje enviado por el asesor humano (Intervención humana automática)
    // Se silencia automáticamente por 2 horas en este chat
    const defaultHours = 2;
    const pauseDurationMs = defaultHours * 60 * 60 * 1000;
    this.pausedChats.set(jid, {
      pausedUntil: Date.now() + pauseDurationMs,
      reason: 'INTERVENCION_HUMANA',
    });

    // Pausar el seguimiento automático para no interrumpir la conversación del asesor
    this.followUpService.onCustomerReplied(jid);
    const queue = this.userQueues.get(jid);
    if (queue?.timer) clearTimeout(queue.timer);
    this.userQueues.delete(jid);

    console.log('\n======================================================');
    console.log(`👤 [INTERVENCIÓN HUMANA DETECTADA] en [+${message.senderNumber}]`);
    console.log(`💬 Mensaje del asesor: "${message.text}"`);
    console.log(`⏸️ Bot silenciado automáticamente por ${defaultHours} horas en este chat.`);
    console.log(`💡 Para reactivarlo antes, envía #activar en cualquier momento.`);
    console.log('======================================================\n');
  }

  /**
   * Verifica si un chat está actualmente silenciado por intervención humana
   */
  private isChatPaused(jid: string, message: NormalizedMessage): boolean {
    const pauseInfo = this.pausedChats.get(jid);
    if (!pauseInfo) return false;

    // Si aún está dentro de la ventana de pausa:
    if (Date.now() < pauseInfo.pausedUntil) {
      const remainingMinutes = Math.max(1, Math.ceil((pauseInfo.pausedUntil - Date.now()) / 60000));
      console.log(`\n⏸️ [CHAT SILENCIADO] Mensaje de ${message.senderName || 'Cliente'} (+${message.senderNumber}): "${message.text}"`);
      console.log(`ℹ️ El bot NO responderá porque está bajo control del asesor humano (pausa activa por ${remainingMinutes} min más).`);
      console.log(`💡 Para que el bot vuelva a responder, escribe #activar en el chat.\n`);
      return true;
    }

    // Si el tiempo de pausa ya expiró:
    this.pausedChats.delete(jid);
    console.log(`\n▶️ [FIN DE PAUSA] La intervención humana finalizó para [+${message.senderNumber}]. Maria Paula retoma la atención.\n`);
    return false;
  }

  private async processMessageBatch(jid: string): Promise<void> {
    const queue = this.userQueues.get(jid);
    if (!queue || queue.messages.length === 0 || queue.isProcessing) {
      return;
    }

    queue.isProcessing = true;
    queue.timer = undefined;

    // Extraer todos los mensajes acumulados en la ventana de tiempo
    const batch = [...queue.messages];
    queue.messages = [];

    const sender = queue.sender;

    try {
      // Unificar el texto de los mensajes acumulados
      const combinedText = batch
        .map((m) => m.text.trim())
        .filter(Boolean)
        .join('\n');

      if (!combinedText) {
        return;
      }

      // Tomar los metadatos del mensaje más reciente del lote
      const latestMessage = batch[batch.length - 1];
      const unifiedMessage: NormalizedMessage = {
        ...latestMessage,
        text: combinedText,
      };

      if (batch.length > 1) {
        console.log('\n📦 ================= PAQUETE DE MENSAJES UNIFICADO =================');
        console.log(`👤 De: ${unifiedMessage.senderName || 'Cliente'} (+${unifiedMessage.senderNumber}) [${batch.length} mensajes combinados]`);
        console.log(`💬 Contenido agrupado:\n${unifiedMessage.text}`);
        console.log(`🕒 Hora: ${new Date(unifiedMessage.timestamp * 1000).toLocaleTimeString()}`);
        console.log('===================================================================');
      } else {
        console.log('\n📩 ---------------- PROCESANDO MENSAJE ----------------');
        console.log(`👤 De: ${unifiedMessage.senderName || 'Cliente'} (+${unifiedMessage.senderNumber})`);
        console.log(`💬 Mensaje: "${unifiedMessage.text}"`);
        console.log(`🕒 Hora: ${new Date(unifiedMessage.timestamp * 1000).toLocaleTimeString()}`);
        console.log('-------------------------------------------------------');
      }

      let responseText: string;
      let source: string;
      let buttonsToAttach: IButtonOption[] | undefined;

      // 1. Verificar si coincide con una respuesta rápida local (0 consumo de IA)
      const quickMatch = this.quickReplyService.matchQuickReply(unifiedMessage.text, unifiedMessage.remoteJid);

      if (quickMatch.matched && quickMatch.response) {
        source = `⚡ Software Local [Intención: ${quickMatch.intent}]`;
        responseText = quickMatch.response;
        buttonsToAttach = quickMatch.buttons;

        if (quickMatch.nextState) {
          this.quickReplyService.setState(unifiedMessage.remoteJid, quickMatch.nextState);
        } else if (this.quickReplyService.getState(unifiedMessage.remoteJid) === 'NEW') {
          this.quickReplyService.setState(unifiedMessage.remoteJid, 'PRICING_SENT');
        }
        this.quickReplyService.markGreeted(unifiedMessage.remoteJid);

        // Si el cliente confirmó el pedido, desactivar el seguimiento para siempre
        if (quickMatch.intent === 'CONFIRM_ORDER') {
          this.followUpService.markOrderCompleted(unifiedMessage.remoteJid);
          console.log(`🎉 ¡PEDIDO CONFIRMADO EXITOSAMENTE PARA EL CLIENTE (+${unifiedMessage.senderNumber})!`);
        }

        // Sincronizar el historial para que Gemini sepa de qué se ha hablado
        if (this.aiService.recordExchange) {
          this.aiService.recordExchange(unifiedMessage.remoteJid, unifiedMessage.text, responseText);
        }
      } else {
        source = '🧠 Gemini AI (3.1-flash-lite)';
        // 2. Si es una duda compleja, objeción o flujo abierto, recurre a Gemini AI con el texto unificado
        responseText = await this.aiService.generateResponse(
          unifiedMessage.remoteJid,
          unifiedMessage.text,
          unifiedMessage.senderName
        );

        this.quickReplyService.markGreeted(unifiedMessage.remoteJid);

        // Si Gemini formuló el resumen de pedido o solicita confirmación, agregar botón interactivo
        if (responseText.includes('RESUMEN DE TU PEDIDO') || (responseText.includes('CONFIRMAR') && !responseText.includes('CONFIRMADO'))) {
          buttonsToAttach = [{ id: 'CONFIRMAR', displayText: '✅ CONFIRMAR PEDIDO' }];
          this.quickReplyService.setState(unifiedMessage.remoteJid, 'CONFIRMATION_PENDING');
        } else if (responseText.includes('100% CONFIRMADO')) {
          this.followUpService.markOrderCompleted(unifiedMessage.remoteJid);
          this.quickReplyService.setState(unifiedMessage.remoteJid, 'ORDER_CONFIRMED');
          console.log(`🎉 ¡PEDIDO CONFIRMADO EXITOSAMENTE VÍA IA PARA (+${unifiedMessage.senderNumber})!`);
        } else if (this.quickReplyService.getState(unifiedMessage.remoteJid) === 'NEW') {
          this.quickReplyService.setState(unifiedMessage.remoteJid, 'PRICING_SENT');
        }
      }

      console.log(`🎯 Origen de respuesta: ${source}`);
      console.log('-------------------------------------------------------');

      // 3. Simulación de comportamiento humano (Anti-Ban): Pequeña pausa inicial
      await this.sleep(1000);

      // 4. Activar presencia "Escribiendo..." en el chat de WhatsApp
      await sender.sendTypingState(unifiedMessage.remoteJid);

      // 5. Pausa de lectura/escritura proporcional al mensaje (1.5s - 3.5s)
      const typingTime = Math.min(Math.max(responseText.length * 20, 1500), 3500);
      await this.sleep(typingTime);

      // 6. Enviar respuesta final con imagen si aplica, con botón interactivo si aplica, o como texto plano
      if (quickMatch?.mediaPath && sender.sendImageMessage) {
        await sender.sendImageMessage(unifiedMessage.remoteJid, quickMatch.mediaPath, responseText);
      } else if (buttonsToAttach && buttonsToAttach.length > 0) {
        await sender.sendInteractiveButtons(
          unifiedMessage.remoteJid,
          responseText,
          buttonsToAttach,
          'MoraMerco Colombia',
          'Toca el botón o responde este mensaje'
        );
      } else {
        await sender.sendTextMessage(unifiedMessage.remoteJid, responseText);
      }

      console.log('\n📤 ---------------- MENSAJE ENVIADO ----------------');
      console.log(`👤 Para: ${unifiedMessage.senderName || 'Cliente'} (+${unifiedMessage.senderNumber})`);
      console.log(`💬 Respuesta:\n"${responseText}"`);
      if (buttonsToAttach && buttonsToAttach.length > 0) {
        console.log(`🔘 Botones adjuntos: ${buttonsToAttach.map((b) => b.displayText).join(' | ')}`);
      }
      console.log(`🎯 Vía: [${source}]`);
      console.log(`🕒 Hora: ${new Date().toLocaleTimeString()}`);
      console.log('----------------------------------------------------\n');

      // 7. Programar seguimiento automático solo si el pedido NO ha sido confirmado
      const currentState = this.quickReplyService.getState(unifiedMessage.remoteJid);
      if (quickMatch?.intent !== 'CONFIRM_ORDER' && currentState !== 'ORDER_CONFIRMED') {
        this.followUpService.scheduleFollowUp(unifiedMessage.remoteJid, sender);
      }
    } catch (error) {
      console.error(`❌ Error procesando lote de mensajes para [${jid}]:`, error);
    } finally {
      queue.isProcessing = false;

      // Si llegaron nuevos mensajes mientras se procesaba la respuesta previa, iniciar nuevo ciclo
      if (queue.messages.length > 0) {
        queue.timer = setTimeout(async () => {
          await this.processMessageBatch(jid);
        }, this.debounceMs);
      } else {
        this.userQueues.delete(jid);
      }
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
