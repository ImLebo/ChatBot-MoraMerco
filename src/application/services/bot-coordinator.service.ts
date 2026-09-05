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

export class BotCoordinatorService implements IMessageHandler {
  private readonly userQueues = new Map<string, UserMessageQueue>();
  private readonly debounceMs: number;

  constructor(
    private readonly aiService: IAiService,
    private readonly quickReplyService: QuickReplyService = new QuickReplyService(),
    private readonly followUpService: FollowUpService = new FollowUpService(45, 3),
    debounceMs: number = 4500
  ) {
    this.debounceMs = debounceMs;
  }

  public async handleIncomingMessage(
    message: NormalizedMessage,
    sender: IMessageSender
  ): Promise<void> {
    const jid = message.remoteJid;

    // 0. Si el cliente envió cualquier mensaje, pausar inmediatamente cualquier seguimiento pendiente
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
        }

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
        source = '🧠 Gemini AI (3.6-flash)';
        // 2. Si es una duda compleja, objeción o flujo abierto, recurre a Gemini AI con el texto unificado
        responseText = await this.aiService.generateResponse(
          unifiedMessage.remoteJid,
          unifiedMessage.text,
          unifiedMessage.senderName
        );

        // Si Gemini formuló el resumen de pedido o solicita confirmación, agregar botón interactivo
        if (responseText.includes('RESUMEN DE TU PEDIDO') || (responseText.includes('CONFIRMAR') && !responseText.includes('CONFIRMADO'))) {
          buttonsToAttach = [{ id: 'CONFIRMAR', displayText: '✅ CONFIRMAR PEDIDO' }];
          this.quickReplyService.setState(unifiedMessage.remoteJid, 'CONFIRMATION_PENDING');
        } else if (responseText.includes('100% CONFIRMADO')) {
          this.followUpService.markOrderCompleted(unifiedMessage.remoteJid);
          this.quickReplyService.setState(unifiedMessage.remoteJid, 'ORDER_CONFIRMED');
          console.log(`🎉 ¡PEDIDO CONFIRMADO EXITOSAMENTE VÍA IA PARA (+${unifiedMessage.senderNumber})!`);
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

      // 6. Enviar respuesta final con botón interactivo si aplica, o como texto plano
      if (buttonsToAttach && buttonsToAttach.length > 0) {
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

      console.log(`📤 Maria Paula respondió a +${unifiedMessage.senderNumber} vía [${source}]`);

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
