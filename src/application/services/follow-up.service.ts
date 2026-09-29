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
        `Estimado/a cliente, reciba un cordial saludo de parte de MoraMerco 😊\n\n` +
        `Le escribo con el mayor agrado para consultarle si le quedó alguna inquietud acerca de las medidas o el funcionamiento de la base para sus electrodomésticos.\n\n` +
        `Recuerde que al ser barras de acero independientes y telescópicas con 24 ruedas y frenos, se adaptan a cualquier nevera o lavadora sin esfuerzo ni herramientas, elevan 4 cm para trapear sabroso sin matarse la espalda y protegen sus equipos del óxido. Quedo muy atenta a sus indicaciones ✨`;
    } else if (stage === 2) {
      messageText =
        `Buen día, le saluda nuevamente Maria Paula de MoraMerco 👋\n\n` +
        `Paso a comentarle respetuosamente que en nuestra bodega nos encontramos organizando los despachos del día junto a la transportadora 🚚📦\n\n` +
        `¿Desea que alcancemos a programar su entrega con el *Envío Gratis* y pago contra entrega en efectivo al recibir en su domicilio? Quedo muy atenta para dejársela lista de inmediato 🙌`;
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

      console.log('\n📤 ------------ SEGUIMIENTO AUTOMÁTICO ENVIADO ------------');
      console.log(`👤 Para: [${jid}] (Etapa #${stage})`);
      console.log(`💬 Mensaje:\n"${messageText}"`);
      console.log(`🕒 Hora: ${new Date().toLocaleTimeString()}`);
      console.log('-----------------------------------------------------------\n');

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
