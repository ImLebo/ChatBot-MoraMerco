import { IMessageHandler, IMessageSender, IButtonOption } from '../../domain/services/message-handler.interface.js';
import { NormalizedMessage } from '../../domain/models/message.model.js';
import { IAiService } from '../../domain/services/ai-service.interface.js';
import { QuickReplyService } from '../../domain/services/quick-reply.service.js';
import { FollowUpService } from './follow-up.service.js';

export class BotCoordinatorService implements IMessageHandler {
  constructor(
    private readonly aiService: IAiService,
    private readonly quickReplyService: QuickReplyService = new QuickReplyService(),
    private readonly followUpService: FollowUpService = new FollowUpService(45, 3)
  ) {}

  public async handleIncomingMessage(
    message: NormalizedMessage,
    sender: IMessageSender
  ): Promise<void> {
    console.log('\n📩 ---------------- NUEVO MENSAJE ----------------');
    console.log(`👤 De: ${message.senderName || 'Cliente'} (+${message.senderNumber})`);
    console.log(`💬 Mensaje: "${message.text}"`);
    console.log(`🕒 Hora: ${new Date(message.timestamp * 1000).toLocaleTimeString()}`);

    // 0. Si el cliente respondió, pausar cualquier seguimiento automático pendiente
    this.followUpService.onCustomerReplied(message.remoteJid);

    let responseText: string;
    let source: string;
    let buttonsToAttach: IButtonOption[] | undefined;

    // 1. Verificar si coincide con una respuesta rápida local (0 consumo de IA)
    const quickMatch = this.quickReplyService.matchQuickReply(message.text, message.remoteJid);

    if (quickMatch.matched && quickMatch.response) {
      source = `⚡ Software Local [Intención: ${quickMatch.intent}]`;
      responseText = quickMatch.response;
      buttonsToAttach = quickMatch.buttons;

      if (quickMatch.nextState) {
        this.quickReplyService.setState(message.remoteJid, quickMatch.nextState);
      }

      // Si el cliente confirmó el pedido, desactivar el seguimiento para siempre
      if (quickMatch.intent === 'CONFIRM_ORDER') {
        this.followUpService.markOrderCompleted(message.remoteJid);
        console.log(`🎉 ¡PEDIDO CONFIRMADO EXITOSAMENTE PARA EL CLIENTE (+${message.senderNumber})!`);
      }

      // Sincronizar el historial para que Gemini sepa de qué se ha hablado
      if (this.aiService.recordExchange) {
        this.aiService.recordExchange(message.remoteJid, message.text, responseText);
      }
    } else {
      source = '🧠 Gemini AI (3.6-flash)';
      // 2. Si es una duda compleja, objeción o flujo abierto, recurre a Gemini AI
      responseText = await this.aiService.generateResponse(
        message.remoteJid,
        message.text,
        message.senderName
      );

      // Si Gemini formuló el resumen de pedido o solicita confirmación, agregar botón interactivo
      if (responseText.includes('RESUMEN DE TU PEDIDO') || (responseText.includes('CONFIRMAR') && !responseText.includes('CONFIRMADO'))) {
        buttonsToAttach = [{ id: 'CONFIRMAR', displayText: '✅ CONFIRMAR PEDIDO' }];
        this.quickReplyService.setState(message.remoteJid, 'CONFIRMATION_PENDING');
      } else if (responseText.includes('100% CONFIRMADO')) {
        this.followUpService.markOrderCompleted(message.remoteJid);
        this.quickReplyService.setState(message.remoteJid, 'ORDER_CONFIRMED');
        console.log(`🎉 ¡PEDIDO CONFIRMADO EXITOSAMENTE VÍA IA PARA (+${message.senderNumber})!`);
      }
    }

    console.log(`🎯 Origen de respuesta: ${source}`);
    console.log('-------------------------------------------------');

    // 3. Simulación de comportamiento humano (Anti-Ban): Pequeña pausa inicial
    await this.sleep(1000);

    // 4. Activar presencia "Escribiendo..." en el chat de WhatsApp
    await sender.sendTypingState(message.remoteJid);

    // 5. Pausa de lectura/escritura proporcional al mensaje (1.5s - 3.5s)
    const typingTime = Math.min(Math.max(responseText.length * 20, 1500), 3500);
    await this.sleep(typingTime);

    // 6. Enviar respuesta final con botón interactivo si aplica, o como texto plano
    if (buttonsToAttach && buttonsToAttach.length > 0) {
      await sender.sendInteractiveButtons(
        message.remoteJid,
        responseText,
        buttonsToAttach,
        'MoraMerco Colombia',
        'Toca el botón o responde este mensaje'
      );
    } else {
      await sender.sendTextMessage(message.remoteJid, responseText);
    }

    console.log(`📤 Maria Paula respondió a +${message.senderNumber} vía [${source}]`);

    // 7. Programar seguimiento automático solo si el pedido NO ha sido confirmado
    const currentState = this.quickReplyService.getState(message.remoteJid);
    if (quickMatch?.intent !== 'CONFIRM_ORDER' && currentState !== 'ORDER_CONFIRMED') {
      this.followUpService.scheduleFollowUp(message.remoteJid, sender);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
