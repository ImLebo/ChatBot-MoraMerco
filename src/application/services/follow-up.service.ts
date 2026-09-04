import { IMessageSender } from '../../domain/services/message-handler.interface.js';

interface ChatFollowUpState {
  jid: string;
  stage: number; // 0 = sin seguimiento, 1 = seguimiento 1 enviado, 2 = seguimiento 2 enviado (cerrado)
  isOrderCompleted: boolean;
  timer?: NodeJS.Timeout;
}

export class FollowUpService {
  private readonly chats = new Map<string, ChatFollowUpState>();

  // Tiempos configurables (por defecto 45 minutos para el primero, 3 horas para el segundo)
  // En milisegundos:
  private readonly delayStage1Ms: number;
  private readonly delayStage2Ms: number;

  constructor(
    stage1Minutes: number = 45,
    stage2Hours: number = 3
  ) {
    this.delayStage1Ms = stage1Minutes * 60 * 1000;
    this.delayStage2Ms = stage2Hours * 60 * 60 * 1000;
  }

  /**
   * Se ejecuta cada vez que el cliente responde: CANCELA cualquier seguimiento pendiente
   */
  public onCustomerReplied(jid: string): void {
    const chat = this.chats.get(jid);
    if (chat?.timer) {
      clearTimeout(chat.timer);
      chat.timer = undefined;
      console.log(`⏱️ Seguimiento pausado para [${jid}] porque el cliente respondió.`);
    }
  }

  /**
   * Marca el pedido como completado/confirmado para NUNCA volver a enviarle seguimiento de carrito
   */
  public markOrderCompleted(jid: string): void {
    const chat = this.chats.get(jid) || { jid, stage: 0, isOrderCompleted: false };
    if (chat.timer) {
      clearTimeout(chat.timer);
      chat.timer = undefined;
    }
    chat.isOrderCompleted = true;
    this.chats.set(jid, chat);
    console.log(`✅ Pedido confirmado para [${jid}]. Seguimiento cancelado permanentemente.`);
  }

  /**
   * Programa el próximo seguimiento después de que Maria Paula responde
   */
  public scheduleFollowUp(jid: string, sender: IMessageSender): void {
    let chat = this.chats.get(jid);

    if (!chat) {
      chat = { jid, stage: 0, isOrderCompleted: false };
      this.chats.set(jid, chat);
    }

    // Si ya completó el pedido o ya recibió los 2 seguimientos, no hacer nada
    if (chat.isOrderCompleted || chat.stage >= 2) {
      return;
    }

    // Limpiar timer anterior si existía
    if (chat.timer) {
      clearTimeout(chat.timer);
    }

    const nextDelay = chat.stage === 0 ? this.delayStage1Ms : this.delayStage2Ms;
    const targetStage = chat.stage + 1;

    console.log(`⏳ Seguimiento #${targetStage} programado para [${jid}] en ${nextDelay / 60000} minutos.`);

    chat.timer = setTimeout(async () => {
      await this.triggerFollowUp(jid, targetStage, sender);
    }, nextDelay);
  }

  /**
   * Envía el mensaje de seguimiento cuidando las normas anti-spam y horarios
   */
  private async triggerFollowUp(jid: string, stage: number, sender: IMessageSender): Promise<void> {
    const chat = this.chats.get(jid);
    if (!chat || chat.isOrderCompleted || chat.stage >= stage) {
      return;
    }

    // 1. Validar horario comercial de Colombia (8:00 AM a 8:30 PM)
    if (!this.isWithinBusinessHours()) {
      console.log(`🌙 Fuera de horario comercial para seguimiento a [${jid}]. Se pospone.`);
      return;
    }

    // 2. Seleccionar el mensaje según la etapa
    let messageText = '';
    if (stage === 1) {
      messageText =
        `¡Hola! Te escribo con mucho cariño para saber si te quedó alguna duda sobre las medidas o el funcionamiento de la base para tu equipo 😊\n\n` +
        `Recuerda que como se ajusta de 40 a 70 cm le queda perfecta a cualquier nevera o lavadora y protege tus pisos de humedad y rayones. ¡Quedo súper atenta por si te puedo colaborar en algo! ✨`;
    } else if (stage === 2) {
      messageText =
        `¡Hola! Paso a saludarte porque nuestro equipo en bodega ya está cerrando los despachos del día de hoy con la transportadora 🚚📦\n\n` +
        `¿Te gustaría que alcancemos a programar la tuya con el *Envío Gratis* y pago en efectivo al recibir en casa? Si deseas, me confirmas y te la dejamos lista hoy mismo 🙌💛`;
    }

    if (!messageText) return;

    try {
      // 3. Simulación humana (Escribiendo...)
      await sender.sendTypingState(jid);
      await new Promise((resolve) => setTimeout(resolve, 2500));

      // 4. Enviar mensaje de seguimiento
      await sender.sendTextMessage(jid, messageText);
      chat.stage = stage;
      chat.timer = undefined;

      console.log(`📤 Seguimiento automático #${stage} ENVIADO a [${jid}] exitosamente.`);

      // Si fue el seguimiento 1, programar el seguimiento 2
      if (stage === 1) {
        this.scheduleFollowUp(jid, sender);
      }
    } catch (error) {
      console.error(`❌ Error enviando seguimiento automático a [${jid}]:`, error);
    }
  }

  /**
   * Verifica si la hora actual está entre 8:00 AM y 8:30 PM
   */
  private isWithinBusinessHours(): boolean {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();

    // 8:00 AM a 20:30 (8:30 PM)
    if (currentHour < 8 || currentHour > 20) return false;
    if (currentHour === 20 && currentMinute > 30) return false;

    return true;
  }
}
