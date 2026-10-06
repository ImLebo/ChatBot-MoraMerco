import { IMessageHandler, IMessageSender, IButtonOption } from '../../domain/services/message-handler.interface.js';
import { NormalizedMessage } from '../../domain/models/message.model.js';
import { IAiService } from '../../domain/services/ai-service.interface.js';
import { QuickReplyService } from '../../domain/services/quick-reply.service.js';
import { DataValidatorService, CustomerShippingData } from '../../domain/services/data-validator.service.js';
import { FollowUpService } from './follow-up.service.js';
import {
  findProductByKeywords,
  getProductBySlug,
  getAllProducts,
  DEFAULT_PRODUCT,
} from '../../config/products.config.js';
import { ProductConfig } from '../../domain/models/product.model.js';
import { config } from '../../config/env.config.js';

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

    // 0. Si es un mensaje de grupo: MOSTRAR en consola para monitoreo, pero NUNCA responder
    if (message.isGroup) {
      const senderDisplay = message.fromMe
        ? 'Tú (Asesor)'
        : `${message.senderName || 'Participante'} (+${message.senderNumber})`;

      console.log('\n👥 ================= MENSAJE DE GRUPO RECIBIDO =================');
      console.log(`🏷️  Nombre del Grupo: ${message.groupName ? `"${message.groupName}"` : '(Sin nombre detectado)'}`);
      console.log(`🆔 ID del Grupo: ${message.remoteJid}`);
      console.log(`👤 Remitente: ${senderDisplay}`);
      console.log(`💬 Mensaje: "${message.text}"`);
      console.log(`🕒 Hora: ${new Date(message.timestamp * 1000).toLocaleTimeString()}`);
      console.log(`🛡️  [SOLO LECTURA] El bot NO responderá por tratarse de un grupo.`);
      console.log('=================================================================\n');
      return;
    }

    // 1. Si el mensaje fue enviado por el ASESOR HUMANO (desde su celular o WhatsApp Web)
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

      // Salvaguarda: si el mensaje contiene datos de envío, validarlos y guardarlos de inmediato
      if (DataValidatorService.isLikelyShippingData(unifiedMessage.text)) {
        const prev = this.quickReplyService.getCustomerData(unifiedMessage.remoteJid);
        const val = DataValidatorService.validate(unifiedMessage.text, prev);
        if (val.isValid || (val.phone && val.city)) {
          this.quickReplyService.setCustomerData(unifiedMessage.remoteJid, val);
          console.log(`📦 [Datos de Envío Capturados] Nombre: ${val.name || 'N/A'}, Ciudad: ${val.city || 'N/A'}, Tel: ${val.phone || 'N/A'}`);
        }
      }

      // =======================================================================
      // A. IDENTIFICACIÓN Y PERSISTENCIA DEL PRODUCTO ACTIVO
      // =======================================================================
      let activeSlug = this.quickReplyService.getActiveProduct(unifiedMessage.remoteJid);
      let currentProduct = activeSlug ? getProductBySlug(activeSlug) : undefined;

      // 1. Si el cliente envió un clic en botón con formato PRODUCT_{slug}
      if (!currentProduct && unifiedMessage.text.startsWith('PRODUCT_')) {
        const slugCandidate = unifiedMessage.text.replace('PRODUCT_', '').trim();
        const found = getProductBySlug(slugCandidate);
        if (found) {
          currentProduct = found;
          this.quickReplyService.setActiveProduct(unifiedMessage.remoteJid, found.slug);
          console.log(`🎯 [Selección por Botón] Producto vinculado: "${currentProduct.name}" (${currentProduct.slug})`);
        }
      }

      // 2. Si estábamos esperando que elija producto (AWAITING_PRODUCT) y respondió con número
      if (!currentProduct && this.quickReplyService.getState(unifiedMessage.remoteJid) === 'AWAITING_PRODUCT') {
        const all = getAllProducts();
        const num = parseInt(unifiedMessage.text.trim(), 10);
        if (!isNaN(num) && num >= 1 && num <= all.length) {
          currentProduct = all[num - 1];
          this.quickReplyService.setActiveProduct(unifiedMessage.remoteJid, currentProduct.slug);
          console.log(`🎯 [Selección Numérica] Producto vinculado: "${currentProduct.name}" (${currentProduct.slug})`);
        }
      }

      // 3. Evaluar el texto contra las trackingKeywords de cada producto en PRODUCTS_CATALOG
      if (!currentProduct) {
        const matchedProduct = findProductByKeywords(unifiedMessage.text);
        if (matchedProduct) {
          currentProduct = matchedProduct;
          this.quickReplyService.setActiveProduct(unifiedMessage.remoteJid, matchedProduct.slug);
          console.log(`🎯 [Detección de Campaña] Producto identificado por anuncio: "${matchedProduct.name}" (${matchedProduct.slug})`);
        }
      }

      // 4. Si no coincide con ninguno (por ejemplo, el cliente solo escribió "Hola buenas" o saludo general sin producto previo)
      if (!currentProduct) {
        const allProducts = getAllProducts();
        if (allProducts.length === 1) {
          // Si solo hay un producto activo en el catálogo (la Base Ajustable), asignarlo de inmediato sin menú innecesario
          currentProduct = allProducts[0];
          this.quickReplyService.setActiveProduct(unifiedMessage.remoteJid, currentProduct.slug);
          console.log(`🎯 [Producto Único] Cliente asignado automáticamente a: "${currentProduct.name}" (${currentProduct.slug})`);
        } else {
          const optionsText = allProducts
            .map((p, idx) => `${idx + 1}️⃣ *${p.name}*`)
            .join('\n');

          const menuResponse =
            `¡Hola! Soy Maria Paula de MoraMerco 😊 Con mucho gusto le atiendo.\n\n` +
            `Para compartirle la información completa con fotos y precios, por favor cuénteme por cuál de nuestros productos nos escribe:\n\n` +
            `${optionsText}\n\n` +
            `👇 Responda con el número (ej: *1*) o el nombre del producto que vio en nuestro anuncio.`;

          const menuButtons: IButtonOption[] = allProducts.map((p, idx) => ({
            id: `PRODUCT_${p.slug}`,
            displayText: `${idx + 1}. ${p.name.length > 20 ? p.name.slice(0, 18) + '...' : p.name}`,
          }));

          this.quickReplyService.setState(unifiedMessage.remoteJid, 'AWAITING_PRODUCT');
          this.quickReplyService.markGreeted(unifiedMessage.remoteJid);

          await this.sleep(1000);
          await sender.sendTypingState(unifiedMessage.remoteJid);
          await this.sleep(2000);

          if (menuButtons.length > 0) {
            await sender.sendInteractiveButtons(
              unifiedMessage.remoteJid,
              menuResponse,
              menuButtons,
              'MoraMerco Colombia',
              'Seleccione el producto de su interés'
            );
          } else {
            await sender.sendTextMessage(unifiedMessage.remoteJid, menuResponse);
          }

          console.log(`\n📤 [Menú de Productos Enviado] a ${unifiedMessage.senderName || 'Cliente'} (+${unifiedMessage.senderNumber})`);
          return;
        }
      }

      let responseText: string;
      let source: string;
      let buttonsToAttach: IButtonOption[] | undefined;
      let orderJustConfirmed = false;

      // 1. Verificar si coincide con una respuesta rápida local con el producto activo
      const quickMatch = this.quickReplyService.matchQuickReply(unifiedMessage.text, unifiedMessage.remoteJid, currentProduct);

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
          orderJustConfirmed = true;
          console.log(`🎉 ¡PEDIDO CONFIRMADO EXITOSAMENTE PARA EL CLIENTE (+${unifiedMessage.senderNumber})!`);
        }

        // Sincronizar el historial para que Gemini sepa de qué se ha hablado
        if (this.aiService.recordExchange) {
          this.aiService.recordExchange(unifiedMessage.remoteJid, unifiedMessage.text, responseText);
        }
      } else {
        source = `🧠 Gemini AI (${config.geminiModel})`;
        // 2. Si es una duda compleja, objeción o flujo abierto, recurre a Gemini AI con el texto y el producto activo
        responseText = await this.aiService.generateResponse(
          unifiedMessage.remoteJid,
          unifiedMessage.text,
          unifiedMessage.senderName,
          currentProduct
        );

        this.quickReplyService.markGreeted(unifiedMessage.remoteJid);

        // Si Gemini formuló el resumen de pedido o solicita confirmación, agregar botón interactivo y respaldar datos
        if (responseText.includes('RESUMEN DE') || (responseText.includes('CONFIRMAR') && !responseText.includes('CONFIRMADO'))) {
          buttonsToAttach = [{ id: 'CONFIRMAR', displayText: '✅ CONFIRMAR PEDIDO' }];
          this.quickReplyService.setState(unifiedMessage.remoteJid, 'CONFIRMATION_PENDING');
          this.extractAndSaveDataFromAiSummary(unifiedMessage.remoteJid, responseText);
        } else if (responseText.includes('100% CONFIRMADO')) {
          this.followUpService.markOrderCompleted(unifiedMessage.remoteJid);
          this.quickReplyService.setState(unifiedMessage.remoteJid, 'ORDER_CONFIRMED');
          orderJustConfirmed = true;
          this.extractAndSaveDataFromAiSummary(unifiedMessage.remoteJid, responseText);
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
        this.followUpService.scheduleFollowUp(unifiedMessage.remoteJid, sender, currentProduct);
      }

      // 8. Si el pedido fue confirmado, enviar notificación automática al grupo interno de ventas
      if (orderJustConfirmed) {
        await this.notifySalesGroup(unifiedMessage, currentProduct, sender);
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

  /**
   * Envía una alerta automática con los datos del pedido confirmado al grupo interno de ventas/operaciones
   */
  private async notifySalesGroup(
    message: NormalizedMessage,
    product?: ProductConfig,
    sender?: IMessageSender
  ): Promise<void> {
    const targetGroupJid = config.WHATSAPP_SALES_GROUP_JID || config.whatsappSalesGroupJid;
    if (!targetGroupJid) {
      console.log('ℹ️ [Aviso de Ventas] WHATSAPP_SALES_GROUP_JID no configurado. Se omite notificación a grupo interno.');
      return;
    }

    try {
      let savedData = this.quickReplyService.getCustomerData(message.remoteJid);
      if (!savedData || !savedData.isValid || !savedData.phone || !savedData.city) {
        savedData = this.recoverShippingDataFromHistory(message.remoteJid, savedData);
      }

      const customerProduct = this.quickReplyService.getCustomerProduct(message.remoteJid);

      const customerName = savedData?.name || message.senderName || 'Cliente';
      const rawPhone = savedData?.phone || message.senderNumber;
      const cleanDigits = rawPhone.replace(/[^\d]/g, '');
      const waNumber = cleanDigits.length === 10 && cleanDigits.startsWith('3')
        ? `57${cleanDigits}`
        : cleanDigits.startsWith('57')
          ? cleanDigits
          : cleanDigits;

      const productDesc = customerProduct?.description || product?.name || 'Base Ajustable de Acero';
      const priceText = customerProduct?.price
        ? `$${customerProduct.price.toLocaleString('es-CO')}`
        : 'Contra entrega en efectivo';

      const cityDept = savedData?.city
        ? `${savedData.city}${savedData.department && !savedData.city.includes(savedData.department) ? `, ${savedData.department}` : ''}`
        : 'Por coordinar con el cliente';

      const addressText = savedData?.address || 'Por coordinar con el cliente';
      const barrioText = savedData?.neighborhood ? `\n🏘️ *Barrio:* ${savedData.neighborhood}` : '';
      const officeText = savedData?.isOfficeDelivery ? '\n🏢 *Modalidad:* Reclamo en Oficina' : '';

      const now = new Date();
      const timeStr = now.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: true });
      const dateStr = now.toLocaleDateString('es-CO');

      const alertMessage =
        `🚨 *¡NUEVO PEDIDO CONFIRMADO!* 📦🎉\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `🛍️ *Pedido:* ${productDesc}\n` +
        `💰 *Valor:* ${priceText}\n` +
        `💵 *Pago:* Contra entrega en efectivo (Envío Gratis 🚚)\n\n` +
        `👤 *Cliente:* ${customerName}\n` +
        `📱 *WhatsApp:* +${rawPhone} ( https://wa.me/${waNumber} )\n` +
        `📍 *Destino:* ${cityDept}\n` +
        `🏠 *Dirección:* ${addressText}` +
        `${barrioText}` +
        `${officeText}\n\n` +
        `🕒 *Hora:* ${timeStr} | ${dateStr}\n` +
        `━━━━━━━━━━━━━━━━━━━━`;

      if (sender) {
        await sender.sendTextMessage(targetGroupJid, alertMessage);
        console.log(`\n📢 [NOTIFICACIÓN DE VENTA ENVIADA] Alerta enviada con éxito al grupo [${targetGroupJid}] para el pedido de ${customerName} (+${rawPhone})\n`);
      }
    } catch (error) {
      console.error(`❌ Error enviando notificación de venta al grupo [${targetGroupJid}]:`, error);
    }
  }

  /**
   * Extrae campos de envío cuando la IA formula el resumen del pedido
   */
  private extractAndSaveDataFromAiSummary(jid: string, text: string): void {
    const aiData = this.parseAiSummary(text);
    if (aiData.name || aiData.city || aiData.phone) {
      const prev = this.quickReplyService.getCustomerData(jid);
      const merged: CustomerShippingData = {
        isValid: Boolean(aiData.phone && aiData.city),
        name: aiData.name || prev?.name,
        city: aiData.city || prev?.city,
        address: aiData.address || prev?.address,
        phone: aiData.phone || prev?.phone,
        isOfficeDelivery: aiData.address?.toLowerCase().includes('oficina') ?? prev?.isOfficeDelivery,
        missingFields: [],
      };
      this.quickReplyService.setCustomerData(jid, merged);
      console.log(`📦 [Datos Respaldados de Resumen IA] Nombre: ${merged.name || 'N/A'}, Destino: ${merged.city || 'N/A'}, Tel: ${merged.phone || 'N/A'}`);
    }
  }

  private parseAiSummary(text: string): { name?: string; phone?: string; city?: string; address?: string } {
    let name: string | undefined;
    let phone: string | undefined;
    let city: string | undefined;
    let address: string | undefined;

    const recibeMatch = text.match(/(?:recibe|destinatario|nombre)\s*:\s*([^\n\r]+)/i);
    if (recibeMatch) {
      const rawRecibe = recibeMatch[1].replace(/[*\-_]/g, '').trim();
      const phoneInRecibe = rawRecibe.match(/(?:3\d{9}|573\d{9})/);
      if (phoneInRecibe) {
        phone = phoneInRecibe[0];
        name = rawRecibe.replace(phoneInRecibe[0], '').replace(/[-:]/g, '').trim();
      } else {
        name = rawRecibe;
      }
    }

    const destinoMatch = text.match(/(?:destino|ciudad)\s*:\s*([^\n\r]+)/i);
    if (destinoMatch) {
      city = destinoMatch[1].replace(/[*\-_]/g, '').trim();
    }

    const entregaMatch = text.match(/(?:entrega|direcci[oó]n)\s*:\s*([^\n\r]+)/i);
    if (entregaMatch) {
      address = entregaMatch[1].replace(/[*\-_]/g, '').trim();
    }

    return { name, phone, city, address };
  }

  /**
   * Intenta recuperar los datos de envío inspeccionando el historial de mensajes
   */
  private recoverShippingDataFromHistory(jid: string, existing?: CustomerShippingData): CustomerShippingData | undefined {
    if (!this.aiService.getHistory) return existing;
    const history = this.aiService.getHistory(jid);
    if (!history || history.length === 0) return existing;

    let recovered: CustomerShippingData | undefined = existing;

    for (let i = history.length - 1; i >= 0; i--) {
      const item = history[i];
      for (const part of item.parts) {
        if (!part.text) continue;

        if (item.role === 'user') {
          if (DataValidatorService.isLikelyShippingData(part.text)) {
            const val = DataValidatorService.validate(part.text, recovered);
            if (val.phone || val.city || val.name) {
              recovered = {
                isValid: val.isValid || Boolean(val.phone && val.city),
                name: val.name || recovered?.name,
                city: val.city || recovered?.city,
                department: val.department || recovered?.department,
                neighborhood: val.neighborhood || recovered?.neighborhood,
                address: val.address || recovered?.address,
                phone: val.phone || recovered?.phone,
                isOfficeDelivery: val.isOfficeDelivery ?? recovered?.isOfficeDelivery,
                officeName: val.officeName || recovered?.officeName,
                missingFields: val.missingFields,
              };
            }
          }
        } else if (item.role === 'model') {
          if (part.text.includes('RESUMEN DE')) {
            const aiData = this.parseAiSummary(part.text);
            if (aiData.name || aiData.city || aiData.phone) {
              recovered = {
                isValid: true,
                name: aiData.name || recovered?.name,
                city: aiData.city || recovered?.city,
                address: aiData.address || recovered?.address,
                phone: aiData.phone || recovered?.phone,
                isOfficeDelivery: aiData.address?.toLowerCase().includes('oficina') ?? recovered?.isOfficeDelivery,
                missingFields: [],
              };
            }
          }
        }
      }
      if (recovered?.phone && recovered?.city && recovered?.address) {
        break;
      }
    }

    if (recovered) {
      this.quickReplyService.setCustomerData(jid, recovered);
    }
    return recovered;
  }
}
