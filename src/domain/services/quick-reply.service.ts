import path from 'path';
import fs from 'fs';
import { IButtonOption } from './message-handler.interface.js';
import { DataValidatorService, CustomerShippingData } from './data-validator.service.js';
import { FuzzyMatcherService } from './fuzzy-matcher.service.js';
import { ProductConfig, PricingCombo } from '../models/product.model.js';
import { ChatState as IChatState, ChatFlowStage } from '../models/message.model.js';
import { DEFAULT_PRODUCT, getProductBySlug } from '../../config/products.config.js';

export type ChatState = ChatFlowStage;

export interface QuickReplyResult {
  matched: boolean;
  intent?: string;
  response?: string;
  buttons?: IButtonOption[];
  nextState?: ChatFlowStage;
  mediaPath?: string;
}

export interface CustomerProductSelection {
  description: string;
  price: number;
}

export class QuickReplyService {
  private readonly chatStates = new Map<string, IChatState>();
  private readonly customerData = new Map<string, CustomerShippingData>();
  private readonly customerProduct = new Map<string, CustomerProductSelection>();
  private readonly greetedJids = new Set<string>();

  /**
   * Limpia el texto eliminando acentos, caracteres especiales y espacios extra
   */
  private normalizeText(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Quita tildes
      .replace(/[^\w\s]/gi, '') // Quita signos de puntuación y emojis
      .trim();
  }

  public getState(jid: string): ChatFlowStage {
    return this.chatStates.get(jid)?.stage || 'NEW';
  }

  public setState(jid: string, stage: ChatFlowStage): void {
    const current = this.chatStates.get(jid) || { stage: 'NEW' };
    current.stage = stage;
    current.updatedAt = Date.now();
    this.chatStates.set(jid, current);
    if (stage !== 'NEW') {
      this.greetedJids.add(jid);
    }
  }

  public getChatState(jid: string): IChatState {
    return this.chatStates.get(jid) || { stage: 'NEW' };
  }

  public setChatState(jid: string, state: Partial<IChatState>): void {
    const current = this.chatStates.get(jid) || { stage: 'NEW' };
    if (state.stage) current.stage = state.stage;
    if (state.activeProductId !== undefined) current.activeProductId = state.activeProductId;
    if (state.selectedComboId !== undefined) current.selectedComboId = state.selectedComboId;
    current.updatedAt = Date.now();
    this.chatStates.set(jid, current);
  }

  public getActiveProduct(jid: string): string | undefined {
    return this.chatStates.get(jid)?.activeProductId;
  }

  public setActiveProduct(jid: string, slug: string): void {
    const current = this.chatStates.get(jid) || { stage: 'NEW' };
    current.activeProductId = slug;
    current.updatedAt = Date.now();
    this.chatStates.set(jid, current);
  }

  public getSelectedCombo(jid: string): string | undefined {
    return this.chatStates.get(jid)?.selectedComboId;
  }

  public setSelectedCombo(jid: string, comboId: string): void {
    const current = this.chatStates.get(jid) || { stage: 'NEW' };
    current.selectedComboId = comboId;
    current.updatedAt = Date.now();
    this.chatStates.set(jid, current);
  }

  public hasBeenGreeted(jid: string): boolean {
    return this.greetedJids.has(jid) || (this.chatStates.has(jid) && this.chatStates.get(jid)!.stage !== 'NEW');
  }

  public markGreeted(jid: string): void {
    this.greetedJids.add(jid);
  }

  public getCustomerData(jid: string): CustomerShippingData | undefined {
    return this.customerData.get(jid);
  }

  public setCustomerData(jid: string, data: CustomerShippingData): void {
    this.customerData.set(jid, data);
  }

  public getCustomerProduct(jid: string): CustomerProductSelection | undefined {
    return this.customerProduct.get(jid);
  }

  public setCustomerProduct(jid: string, product: CustomerProductSelection): void {
    this.customerProduct.set(jid, product);
  }

  /**
   * Da formato amigable y con viñetas al listado de precios de un producto
   */
  public formatPricingList(product: ProductConfig): string {
    return product.pricingCombos
      .map((combo, idx) => {
        const icon = idx === 1 ? '⭐' : idx === 2 ? '🎄' : '🔹';
        const savingsText = combo.savings ? ` (Ahorras $${combo.savings.toLocaleString('es-CO')})` : '';
        const highlight = idx === 1 ? ' 🔥 *¡COMBO ESTRELLA RECOMENDADO!*' : '';
        return `${icon} *${combo.label}:* $${combo.price.toLocaleString('es-CO')}${savingsText}${highlight}`;
      })
      .join('\n');
  }

  /**
   * Detecta si el cliente solicita un combo específico o expresa un cambio de decisión sobre el combo
   */
  public detectComboSelection(
    rawText: string,
    product: ProductConfig,
    currentState: ChatFlowStage
  ): {
    combo: PricingCombo;
    description: string;
    isChangeOfMind: boolean;
  } | null {
    const text = this.normalizeText(rawText);
    const isQuestionOrDoubt = FuzzyMatcherService.hasQuestionOrDoubt(rawText);

    // Verbos o expresiones de cambio de opinión o decisión
    const hasChangeVerb =
      /\b(mejor|cambiame|cambiar|prefiero|en\s*vez\s*de|mas\s*bien|no\s*quiero|cambio|corrijo|corregir|modificar|modificame|ponme|dejame|anotame|apuntame|mandame|deme|dame|quiero|voy\s*a\s*llevar|aparta|llevar)\b/i.test(text);

    // Si es una pregunta de dudas/precio (ej: "¿cuanto cuesta el combo 2?"), NO es un cambio de decisión a menos que use verbo de cambio
    if (isQuestionOrDoubt && !hasChangeVerb) {
      return null;
    }

    const isChangeOfMind =
      /\b(mejor|cambiame|cambiar|prefiero|en\s*vez\s*de|mas\s*bien|no\s*quiero|cambio|corrijo|corregir|modificar|modificame|en\s*cambio)\b/i.test(text);

    const combos = product.pricingCombos;
    const combo1 = combos[0];
    const combo2 = combos[1];
    const combo3 = combos[2];

    // 1. Detección de Combo 3 (Mega Cobertura x3 / 30 metros / $109.900)
    if (combo3) {
      const wantsCombo3 =
        /\b(combo\s*x?\s*3|kit\s*x?\s*3|3\s*unidades|tres\s*unidades|30\s*metros|30m|las\s*3|las\s*tres|los\s*3|los\s*tres|mega\s*cobertura|109\.?900|109k|109900)\b/i.test(text) ||
        (hasChangeVerb && /\b(3|tres|mega\s*cobertura|30\s*metros)\b/i.test(text)) ||
        ((text === '3' || text === 'tres') && (currentState === 'PRICING_SENT' || isChangeOfMind));

      if (wantsCombo3) {
        return {
          combo: combo3,
          description: `${combo3.label} ($${combo3.price.toLocaleString('es-CO')})`,
          isChangeOfMind,
        };
      }
    }

    // 2. Detección de Combo 2 (Combo Estrella x2 / 20 metros / $79.900)
    if (combo2) {
      const mentionsCombo2Explicit =
        /\b(combo\s*x?\s*2|kit\s*x?\s*2|combo\s*estrella|estrella|2\s*unidades|dos\s*unidades|20\s*metros|20m|las\s*2|las\s*dos|los\s*2|los\s*dos|ambas|ambos|dos\s*luces|dos\s*extensiones|79\.?900|79k|79900)\b/i.test(text);

      const wantsCombo2 =
        mentionsCombo2Explicit ||
        (hasChangeVerb && /\b(2|dos|estrella|20\s*metros|las\s*dos|las\s*2)\b/i.test(text)) ||
        (/\b(quiero|mandame|deme|dame|llevar|pedir|comprar|favor|prefiero|anotame|aparta)\b.*(dos|2|estrella|ambas|ambos|combo\s*2|opcion\s*2)/i.test(text) && !text.includes('solo una') && !text.includes('solo 1')) ||
        ((text === '2' || text === 'dos' || text === 'las dos' || text === 'las 2') && (currentState === 'PRICING_SENT' || isChangeOfMind));

      if (wantsCombo2) {
        return {
          combo: combo2,
          description: `${combo2.label} ($${combo2.price.toLocaleString('es-CO')})`,
          isChangeOfMind,
        };
      }
    }

    // 3. Detección de Combo 1 (1 Unidad / 10 metros / $54.900)
    if (combo1) {
      const mentionsMultiple =
        /\b(ambas|ambos|las\s*dos|las\s*2|los\s*dos|los\s*2|2\s*unidades|dos\s*unidades|3\s*unidades|tres\s*unidades)\b/i.test(text) ||
        text.includes('combo 2') || text.includes('combo estrella') || text.includes('combo 3');

      const mentionsSingleExplicit =
        /\b(combo\s*x?\s*1|1\s*unidad|una\s*unidad|10\s*metros|10m|solo\s*una|una\s*sola|solo\s*1|1\s*sola|individual|primera\s*opcion|opcion\s*1|54\.?900|54k|54900)\b/i.test(text) ||
        text === 'solo una' || text === 'una sola' || text === 'una' || text === '1';

      const wantsCombo1 =
        !mentionsMultiple &&
        (mentionsSingleExplicit ||
         (hasChangeVerb && /\b(1|uno|una|solo\s*1|solo\s*una|individual|primera\s*opcion|opcion\s*1)\b/i.test(text)) ||
         (/\b(quiero|mandame|deme|dame|llevar|pedir|comprar|favor|prefiero|anotame|aparta)\b.*(solo\s*una|una\s*sola|solo\s*1|1\s*sola|1\s*unidad|una\s*unidad|primera\s*opcion|opcion\s*1)/i.test(text)) ||
         ((text === '1' || text === 'una' || text === 'el uno' || text === 'la primera') && currentState === 'PRICING_SENT'));

      if (wantsCombo1) {
        return {
          combo: combo1,
          description: `${combo1.label} ($${combo1.price.toLocaleString('es-CO')})`,
          isChangeOfMind,
        };
      }
    }

    return null;
  }


  /**
   * Evalúa el mensaje con memoria de estado y acumulación de datos para dar respuestas
   * ultra rápidas, humanas, concisas y con soporte multi-producto y entregas en oficina
   */
  public matchQuickReply(rawText: string, jid: string, productConfig?: ProductConfig): QuickReplyResult {
    const text = this.normalizeText(rawText);
    const currentState = this.getState(jid);

    // Determinar producto activo en contexto
    const activeSlug = this.getActiveProduct(jid);
    const product = productConfig || (activeSlug ? getProductBySlug(activeSlug) : undefined) || DEFAULT_PRODUCT;
    // Ruta de la imagen del producto activo (prioriza su primaryAssetPath si existe)
    let productMedia: string | undefined;
    if (product.primaryAssetPath && fs.existsSync(product.primaryAssetPath)) {
      productMedia = product.primaryAssetPath;
    } else {
      const solarImg = path.resolve(process.cwd(), 'assets/img_luz_solar/img_luz_solar_1.jpg');
      productMedia = fs.existsSync(solarImg) ? solarImg : undefined;
    }


    // Combos dinámicos del producto
    const combos = product.pricingCombos;
    const combo1 = combos[0] || { id: 'combo-1', label: 'Combo x1', price: 69900 };
    const combo2 = combos[1] || combo1;
    const combo3 = combos[2];
    const pricingListText = this.formatPricingList(product);

    // =========================================================================
    // 0. SELECCIÓN DE PRODUCTO DESDE MENÚ (ESTADO AWAITING_PRODUCT)
    // =========================================================================
    if (currentState === 'AWAITING_PRODUCT') {
      this.markGreeted(jid);
      return {
        matched: true,
        intent: 'PRODUCT_SELECTED_INFO',
        nextState: 'PRICING_SENT',
        mediaPath: productMedia,
        response:
          `¡Con mucho gusto! Aquí te comparto la información y fotos de nuestras *${product.name}* 📸✨\n\n` +
          `Son 100 bombillos LED (10 metros) con panel solar recargable, sensor inteligente al anochecer y certificación impermeable IP65 para exteriores 🌧️💡\n\n` +
          `🚚 *Envío GRATIS y Pago Contra Entrega en efectivo:*\n` +
          `${pricingListText}\n\n` +
          `¿Te gustaría en luz *Cálida* o *Blanca*? ¿O prefieres aprovechar el Combo Estrella de 2 unidades ($79.900)? ⭐`,
      };
    }


    // =========================================================================
    // 0. VERIFICACIÓN Y GESTIÓN DE SELECCIÓN O CAMBIO DE COMBO (CUALQUIER ETAPA)
    // =========================================================================
    const detectedCombo = this.detectComboSelection(rawText, product, currentState);

    if (detectedCombo) {
      this.setSelectedCombo(jid, detectedCombo.combo.id);
      this.customerProduct.set(jid, {
        description: detectedCombo.description,
        price: detectedCombo.combo.price,
      });

      const savedData = this.customerData.get(jid);

      // CASO A: El cliente YA TIENE datos de envío completos y validados (CONFIRMATION_PENDING, ORDER_CONFIRMED o datos guardados)
      if (savedData?.isValid) {
        const addressLine = savedData.isOfficeDelivery
          ? `• Entrega: ${savedData.address} 🏢`
          : `• Dirección: ${savedData.address} 🏠`;
        const destDisplay = savedData.neighborhood
          ? `${savedData.city} (${savedData.neighborhood})`
          : savedData.city;

        const heading = detectedCombo.isChangeOfMind
          ? `¡Listo, con mucho gusto! Le cambiamos su pedido a *${detectedCombo.description}* 🔄📦`
          : `¡Excelente elección! Le dejamos registrado el *${detectedCombo.description}* 📦✨`;

        return {
          matched: true,
          intent: 'COMBO_CHANGE_UPDATED',
          nextState: 'CONFIRMATION_PENDING',
          buttons: [{ id: 'CONFIRMAR', displayText: '✅ CONFIRMAR PEDIDO' }],
          response:
            `${heading}\n\n` +
            `*RESUMEN ACTUALIZADO:* \n` +
            `• Pedido: ${detectedCombo.description}\n` +
            `• Recibe: ${savedData.name} (${savedData.phone})\n` +
            `• Destino: ${destDisplay}\n` +
            `${addressLine}\n` +
            `• Pago: Contra entrega en efectivo (Envío Gratis 🚚)\n\n` +
            `👇 Toque *CONFIRMAR* o responda *CONFIRMAR* para despachar hoy:`,
        };
      }

      // CASO B: El cliente tiene datos parciales pendientes por completar
      if (savedData && savedData.missingFields && savedData.missingFields.length > 0) {
        return {
          matched: true,
          intent: 'COMBO_SELECTED_PARTIAL_DATA',
          nextState: 'DATA_REQUESTED',
          response:
            `¡Excelente elección! Le dejamos registrado el *${detectedCombo.description}* con Envío Gratis y pago contra entrega 🚚🎉\n\n` +
            `Para dejarle programado el despacho hoy, por favor facilítenos:\n` +
            `${savedData.missingFields.map((f) => `• ${f}`).join('\n')}`,
        };
      }

      // CASO C: Aún no ha facilitado datos de envío (inicio de embudo o DATA_REQUESTED)
      // REGLA UPSELL SUAVE SI PIDEN 1 UNIDAD:
      if (detectedCombo.combo.id === 'combo-1' && !savedData?.isValid) {
        return {
          matched: true,
          intent: 'COMBO_1_UPSELL_GENTLE',
          nextState: 'DATA_REQUESTED',
          buttons: [
            { id: 'CONFIRM_COMBO_2', displayText: '⭐ PROMO 2 UNIDADES ($79.900)' },
            { id: 'CONFIRM_COMBO_1', displayText: '1 UNIDAD ($54.900)' },
          ],
          response:
            `Claro que sí, con mucho gusto te despacho 1 unidad por $54.900 😊\n\n` +
            `Solo ten presente que por solo $25.000 adicionales te llevas la segunda (quedan las 2 en *$79.900* - ahorras $30.000) y aseguras cubrir todo el espacio 🎄✨\n\n` +
            `¿Prefieres aprovechar la promo de las 2 unidades ($79.900) o dejamos solo la individual ($54.900)?\n\n` +
            `*(Si dejas 1 unidad, indícanos también si la prefieres en Luz Cálida o Luz Blanca y tus datos para el envío 🚚)*`,
        };
      }

      const savingsStr = detectedCombo.combo.savings
        ? ` (Ahorras $${detectedCombo.combo.savings.toLocaleString('es-CO')})`
        : '';

      return {
        matched: true,
        intent: 'COMBO_SELECTED_REQUEST_DATA',
        nextState: 'DATA_REQUESTED',
        response:
          `¡Excelente elección con el *${detectedCombo.description}*! 🎉${savingsStr} con Envío Gratis y pago contra entrega en efectivo 🚚\n\n` +
          `Para programarte el despacho hoy mismo, por favor facilítanos en un solo mensaje:\n` +
          `• Nombre completo:\n` +
          `• Número de teléfono celular:\n` +
          `• Dirección exacta (con barrio y detalles como torre/apto):\n` +
          `• Ciudad y departamento:\n` +
          `• Tono de luz elegido (Cálida o Blanca):`,
      };
    }


    // =========================================================================
    // 0. CONFIRMACIÓN DIRECTA (BOTÓN, TEXTO O RECLAMO DE DATOS)
    // =========================================================================
    const confirmWords = [
      '1', 'confirmar', 'confirmo', 'confirmado', 'si', 'dale', 'ok', 'listo',
      'de una', 'correcto', 'perfecto', 'si confirmo', 'si claro', 'confirmar pedido',
      'confirmar_pedido', 'confirmar_orden', 'confirmo pedido', 'confirmar ahora'
    ];

    const demandConfirmWords = [
      'te mande mis datos', 'te envie mis datos', 'mis datos', 'confirmas',
      'confirmame', 'no me confirmas', 'ya te los mande', 'ya te los envie',
      'ya envie los datos', 'ya mande los datos', 'confirmar pedido'
    ];

    const isDirectConfirm =
      text === 'confirmar' ||
      text === 'confirmar_pedido' ||
      text === 'confirmar pedido' ||
      text === 'confirmo' ||
      text === 'confirmo pedido';

    const hasDemandConfirm = demandConfirmWords.some((w) => text.includes(w));

    if (
      isDirectConfirm ||
      hasDemandConfirm ||
      (currentState === 'CONFIRMATION_PENDING' && confirmWords.includes(text)) ||
      (currentState === 'DATA_REQUESTED' && confirmWords.includes(text) && text !== '1')
    ) {
      const savedData = this.customerData.get(jid);
      const destinationText = savedData?.city ? `hacia ${savedData.city}` : 'a su destino';
      const officeNote = savedData?.isOfficeDelivery ? ' Recuerde que su paquete llegará para reclamar en oficina.' : '';

      return {
        matched: true,
        intent: 'CONFIRM_ORDER',
        nextState: 'ORDER_CONFIRMED',
        response:
          `¡Pedido 100% CONFIRMADO! 📦🎉\n\n` +
          `Entra a empaque para despacho hoy ${destinationText}. Le llegará en 2 a 4 días hábiles y abona en efectivo al recibir 🙌${officeNote}\n\n` +
          `Apenas la transportadora genere su guía se la compartiremos por aquí. ¡Muchas gracias por su compra en MoraMerco! 😊`,
      };
    }

    // =========================================================================
    // 1. SOLICITUD DE FOTOS O IMÁGENES DEL PRODUCTO (ADAPTA AL ESTADO DEL CHAT)
    // =========================================================================
    const photoWords = [
      'foto', 'fotos', 'fotp', 'fotico', 'foticos', 'fotografia', 'imagen', 'imagenes',
      'video', 'videos', 'catalogo', 'envieme foto', 'mandeme foto', 'puede enviar foto',
      'tienen fotos', 'ver foto', 'ver como es', 'como es', 'mostrar foto', 'enviar fotp',
      'envieme fotos', 'mandeme fotos', 'puede enviar fotp'
    ];
    const isPhotoRequest = photoWords.some((w) => text === w || text.includes(w));

    // Si el cliente pide 2 unidades / Combo Dúo Y además pide foto (ej: "2 Puede enviar fotp")
    const mentionsKit2InPhoto =
      text.includes('2') || text.includes('kit') || text.includes('duo') || text.includes('ambas') || text.includes('dos');

    if (isPhotoRequest && mentionsKit2InPhoto) {
      this.customerProduct.set(jid, {
        description: `${combo2.label} ($${combo2.price.toLocaleString('es-CO')})`,
        price: combo2.price,
      });
      this.setSelectedCombo(jid, combo2.id);

      const introPhotoText = `Aquí te comparto la foto 📸✨ Es nuestro *${combo2.label}*: 2 extensiones solares (20 metros y 200 LEDs en total) ideales para cubrir toda la fachada o balcón con $30.000 de ahorro.`;

      return {
        matched: true,
        intent: 'SELECT_KIT2_WITH_PHOTO',
        nextState: 'DATA_REQUESTED',
        mediaPath: productMedia,
        response:
          `¡Excelente elección con el *${combo2.label}*! 🎉 ($${combo2.price.toLocaleString('es-CO')} con Envío Gratis y pago en casa).\n\n` +
          `${introPhotoText}\n\n` +
          `Para programarte el despacho hoy, por favor facilítanos en un solo mensaje:\n` +
          `• Nombre completo:\n` +
          `• Número de teléfono celular:\n` +
          `• Dirección exacta (con barrio y detalles como torre/apto):\n` +
          `• Ciudad y departamento:\n` +
          `• Tono de luz elegido (Cálida o Blanca):`,
      };
    }


    if (isPhotoRequest) {
      // Si ya está en recolección de datos, NO reiniciar con saludo ni precios
      if (currentState === 'DATA_REQUESTED' || currentState === 'CONFIRMATION_PENDING') {
        const saved = this.customerData.get(jid);
        const namePart = saved?.name ? `, ${saved.name.split(' ')[0]}` : '';
        const destPart = saved?.city ? ` en ${saved.city}` : '';
        const photoDesc = `Es nuestra *${product.name}*: 100 bombillos LED brillantes con panel solar automático de alta eficiencia y certificación IP65 para lluvia y exteriores 🌧️💡`;

        return {
          matched: true,
          intent: 'SEND_PHOTO_DATA_PENDING',
          mediaPath: productMedia,
          response:
            `Con mucho gusto${namePart}, aquí te comparto la foto 📸✨\n\n` +
            `${photoDesc}\n\n` +
            `Continuamos atentos a tus datos de entrega${destPart} para programar tu despacho hoy 🚚📦`,
        };
      }

      // Si la conversación ya está activa o ya se saludó, NUNCA volver a presentarse
      if (this.hasBeenGreeted(jid) || currentState !== 'NEW') {
        const activePhotoDesc = `Son 100 bombillos LED con panel solar de recarga automática, sensor nocturno inteligente y certificación impermeable IP65 🌧️💡`;

        return {
          matched: true,
          intent: 'SEND_PHOTO_ACTIVE',
          mediaPath: productMedia,
          response:
            `Con mucho gusto te comparto la foto 📸✨\n\n` +
            `${activePhotoDesc}\n\n` +
            `${pricingListText}\n\n` +
            `¿Prefieres en luz *Cálida* o *Blanca*? ¿O te dejamos apartado el Combo Estrella de 2 unidades por $79.900? ⭐`,
        };
      }

      // Solo si es absolutamente el primer contacto (NEW)
      this.markGreeted(jid);
      const newPhotoDesc = `Es nuestra *${product.name}*: 100 bombillos LED de 10 metros, panel solar recargable, sensor que se prende solo al anochecer y resistencia total a la intemperie IP65 🌧️✨`;

      return {
        matched: true,
        intent: 'SEND_PHOTO_NEW',
        nextState: 'PRICING_SENT',
        mediaPath: productMedia,
        response:
          `¡Hola! Soy Maria Paula de MoraMerco 😊 Pille pues, aquí te comparto la foto 📸✨\n\n` +
          `${newPhotoDesc}\n\n` +
          `🚚 *Envío GRATIS y pago contra entrega en efectivo:*\n` +
          `${pricingListText}\n\n` +
          `¿Te gustaría en luz *Cálida* o *Blanca*? ¿O te dejamos programado el Combo Estrella de 2 unidades ($79.900)? ⭐`,
      };
    }


    // =========================================================================
    // 2. RECEPCIÓN Y VALIDACIÓN DE DATOS DE ENVÍO CON MEMORIA ACUMULADA
    // =========================================================================
    if (currentState === 'DATA_REQUESTED' || currentState === 'CONFIRMATION_PENDING') {
      // Verificar de forma estricta si el mensaje contiene datos de envío reales
      if (DataValidatorService.isLikelyShippingData(rawText)) {
        const previousData = this.customerData.get(jid);
        const validation = DataValidatorService.validate(rawText, previousData);

        this.customerData.set(jid, validation);

        let doubtPrefix = '';
        if (validation.hasPendingDoubt && validation.doubtAnswer) {
          doubtPrefix = `${validation.doubtAnswer}\n\n`;
        }

        if (validation.isValid) {
          const selectedDesc = this.customerProduct.get(jid)?.description || `${combo1.label} ($${combo1.price.toLocaleString('es-CO')})`;
          const addressLine = validation.isOfficeDelivery
            ? `• Entrega: ${validation.address} 🏢`
            : `• Dirección: ${validation.address} 🏠`;

          const destDisplay = validation.neighborhood
            ? `${validation.city} (${validation.neighborhood})`
            : validation.city;

          return {
            matched: true,
            intent: 'DATA_RECEIVED',
            nextState: 'CONFIRMATION_PENDING',
            buttons: [
              { id: 'CONFIRMAR', displayText: '✅ CONFIRMAR PEDIDO' }
            ],
            response:
              `${doubtPrefix}` +
              `¡Perfecto! Sus datos están completos y verificados para despacho 📦✨\n\n` +
              `*RESUMEN:* \n` +
              `• Pedido: ${selectedDesc}\n` +
              `• Recibe: ${validation.name} (${validation.phone})\n` +
              `• Destino: ${destDisplay}\n` +
              `${addressLine}\n` +
              `• Pago: Contra entrega en efectivo (Envío Gratis 🚚)\n\n` +
              `👇 Toque *CONFIRMAR* o responda *CONFIRMAR* para enviar hoy:`,
          };
        } else {
          return {
            matched: true,
            intent: 'DATA_INCOMPLETE',
            nextState: 'DATA_REQUESTED',
            response: `${doubtPrefix}${validation.feedbackMessage}`,
          };
        }
      }

      // Si el cliente en etapa de datos NO envió datos de despacho, sino una duda o consulta:

      // C. Inquietud sobre el precio del combo o de las 2 unidades
      const isKitPriceQuery =
        /\b(el\s*x|el\s*x2|x2|las\s*2|las\s*dos|kit\s*x?2?|combo\s*x?2?|combo|duo)\b.*(cuesta|costo|vale|precio|valor)/i.test(text) ||
        /\b(cuanto|que)\b.*(cuesta|costo|vale|precio|valor).*(el\s*x|el\s*x2|las\s*2|las\s*dos|kit|combo|duo|barras|bases|vaces)/i.test(text) ||
        text.includes('el x q cuesta') || text.includes('el x que cuesta') || text.includes('el x q costo') ||
        text.includes('las 2 vaces') || text.includes('las dos bases') || text.includes('cuanto valen las 2') ||
        text.includes('trae las dos bases') || text.includes('es cada una') || text.includes('cuanto vale el combo');

      if (isKitPriceQuery) {
        const savingsNote = combo2.savings ? ` (ahorra $${combo2.savings.toLocaleString('es-CO')})` : '';
        return {
          matched: true,
          intent: 'KIT2_PRICE_INQUIRY',
          nextState: 'DATA_REQUESTED',
          response:
            `Con mucho gusto le confirmo: el *${combo2.label}* le sale en *$${combo2.price.toLocaleString('es-CO')}* con Envío Gratis a toda Colombia y pago en efectivo al recibir${savingsNote} 🚚✨\n\n` +
            `¿Desea que le dejemos programado el ${combo2.label}?`,
        };
      }

      // D. Pregunta sobre medios de pago en etapa de datos
      if (/\b(nequi|bancolombia|daviplata|transferencia|tarjeta|como se paga|medio de pago|formas de pago)\b/i.test(text)) {
        return {
          matched: true,
          intent: 'PAYMENT_IN_DATA',
          nextState: 'DATA_REQUESTED',
          response:
            `El pago es 100% contra entrega en efectivo al recibir su paquete en su domicilio o en oficina de Interrapidísimo 💵 (Muchos repartidores también permiten transferencia Nequi/Bancolombia al momento de la entrega).\n\n` +
            `Continuamos muy atentos a sus datos de entrega para programarle el despacho hoy 📦🚚`,
        };
      }

      // E. Pregunta sobre tiempo de envío / entrega
      if (/\b(cuanto demora|cuanto tarda|cuando llega|cuantos dias|tiempo de entrega)\b/i.test(text)) {
        return {
          matched: true,
          intent: 'SHIPPING_IN_DATA',
          nextState: 'DATA_REQUESTED',
          response:
            `El despacho se realiza hoy mismo con Envío Gratis y le llega en un plazo de 2 a 4 días hábiles mediante Interrapidísimo o Coordinadora 🚚📦 Abona en efectivo al recibir en sus manos.\n\n` +
            `Quedamos atentos a sus datos de entrega para dejarlo coordinado de inmediato 🙌`,
        };
      }

      // F. Desistimiento o "lo voy a pensar"
      if (/\b(no gracias|muy caro|caro|pensar|pensarlo|ya no quiero|luego aviso|gracias no)\b/i.test(text)) {
        return {
          matched: true,
          intent: 'DECLINED_IN_DATA',
          response:
            `Comprendemos totalmente 😊 Si más adelante desea coordinar su pedido o resolver cualquier duda sobre ${product.name}, con el mayor gusto estaremos para servirle. ¡Que tenga un excelente día!`,
        };
      }

      // G. Cualquier otra duda o consulta mientras está en etapa de datos o confirmación
      if (FuzzyMatcherService.hasQuestionOrDoubt(rawText)) {
        const topic = FuzzyMatcherService.detectDoubtTopic(rawText);
        const answer = FuzzyMatcherService.getDoubtAnswer(topic);
        const previousData = this.customerData.get(jid);

        let nextPrompt = 'Continuamos muy atentos a sus datos de entrega (Nombre, Ciudad, Dirección, Celular) para programarle el despacho hoy mismo 📦🚚';
        if (previousData?.isValid) {
          nextPrompt = 'Sus datos de despacho ya se encuentran registrados ✅ ¿Desea que le confirmemos el envío hoy mismo?';
        } else if (previousData && previousData.missingFields && previousData.missingFields.length > 0) {
          nextPrompt = `Para programar su entrega hoy con Envío Gratis, por favor facilítenos:\n${previousData.missingFields.map((f) => `• ${f}`).join('\n')}`;
        }

        return {
          matched: true,
          intent: 'DOUBT_IN_DATA_STATE',
          nextState: currentState,
          response: `${answer}\n\n${nextPrompt}`,
        };
      }

      // Si no es un caso de plantilla contemplado, dejar que Gemini AI responda con contexto
      return { matched: false };
    }

    // =========================================================================
    // 3. CONSULTAS DE COMPATIBILIDAD, DUDAS FRECUENTES Y SELECCIÓN DE PRODUCTOS
    // =========================================================================

    // B. CONSULTA DE PRECIO DE COMBO ESTRELLA X2 / "cuanto valen las 2"
    const isKit2PriceInquiry =
      /\b(el\s*x2|x2|las\s*2|las\s*dos|los\s*2|los\s*dos|combo\s*x?2?|combo\s*estrella|estrella|2\s*luces|2\s*extensiones)\b.*(cuesta|costo|vale|precio|valor)/i.test(text) ||
      /\b(cuanto|que)\b.*(cuesta|costo|vale|precio|valor).*(el\s*x2|las\s*2|las\s*dos|combo|estrella|luces)/i.test(text) ||
      text.includes('cuanto valen las 2') || text.includes('cuanto vale el combo estrella') || text.includes('cuanto vale el combo 2');

    if (isKit2PriceInquiry) {
      const savingsNote = combo2.savings ? ` (ahorras $${combo2.savings.toLocaleString('es-CO')})` : '';
      return {
        matched: true,
        intent: 'PRICE_KIT2_EXPLICIT',
        nextState: 'PRICING_SENT',
        response:
          `Con mucho gusto te confirmo: el *${combo2.label}* tiene un valor de *$${combo2.price.toLocaleString('es-CO')}* con Envío Gratis a toda Colombia y pago en efectivo al recibir${savingsNote} 🚚✨\n\n` +
          `¿Deseas que te dejemos programado el ${combo2.label}?`,
      };
    }

    // C. SELECCIÓN DE COMPRA DIRECTA (EL CLIENTE DICE QUÉ DESEA LLEVAR)
    const isQuestionOrDoubt = FuzzyMatcherService.hasQuestionOrDoubt(rawText);

    if (!isQuestionOrDoubt) {
      // 1. Deseo de comprar Combo 3 (si está configurado)
      if (combo3) {
        const wantsKit3 =
          /\b(combo\s*x?\s*3|kit\s*x?\s*3|las\s*3|las\s*tres|los\s*3|los\s*tres|3\s*unidades|tres\s*unidades|30\s*metros|30m|mega\s*cobertura)\b/i.test(text) ||
          text === '3' || text === 'tres';

        if (wantsKit3) {
          this.customerProduct.set(jid, {
            description: `${combo3.label} ($${combo3.price.toLocaleString('es-CO')})`,
            price: combo3.price,
          });
          this.setSelectedCombo(jid, combo3.id);

          const savingsStr = combo3.savings ? ` - Ahorras $${combo3.savings.toLocaleString('es-CO')}` : '';

          return {
            matched: true,
            intent: 'SELECT_KIT3',
            nextState: 'DATA_REQUESTED',
            response:
              `Excelente elección con el *${combo3.label}* 🎉 ($${combo3.price.toLocaleString('es-CO')} con Envío Gratis y pago contra entrega en efectivo${savingsStr}).\n\n` +
              `Para programarte el despacho hoy, por favor facilítanos en un solo mensaje:\n` +
              `• Nombre completo:\n` +
              `• Número de teléfono celular:\n` +
              `• Dirección exacta (con barrio y detalles como torre/apto):\n` +
              `• Ciudad y departamento:\n` +
              `• Tono de luz elegido (Cálida o Blanca):`,
          };
        }
      }

      // 2. Deseo de comprar Combo 2 / Estrella
      const wantsKit2 =
        /\b(quiero|mandame|aparta|deseo|llevar|pedir|comprar|favor)\b.*(combo\s*x?2?|combo\s*estrella|estrella|las\s*dos|las\s*2|dos\s*unidades|2\s*unidades|20\s*metros|20m)/i.test(text) ||
        /\b(el\s*combo\s*estrella|combo\s*estrella|el\s*combo\s*2|combo\s*2|dos\s*luces|2\s*luces)/i.test(text) ||
        ((text === '2' || text === 'dos' || text === 'las dos' || text === 'las 2') && currentState === 'PRICING_SENT');

      if (wantsKit2) {
        this.customerProduct.set(jid, {
          description: `${combo2.label} ($${combo2.price.toLocaleString('es-CO')})`,
          price: combo2.price,
        });
        this.setSelectedCombo(jid, combo2.id);

        const savingsStr = combo2.savings ? ` - Ahorras $${combo2.savings.toLocaleString('es-CO')}` : '';

        return {
          matched: true,
          intent: 'SELECT_KIT2',
          nextState: 'DATA_REQUESTED',
          response:
            `Excelente elección con el *${combo2.label}* 🎉 ($${combo2.price.toLocaleString('es-CO')} con Envío Gratis y pago contra entrega en efectivo${savingsStr}).\n\n` +
            `Para programarte el despacho hoy, por favor facilítanos en un solo mensaje:\n` +
            `• Nombre completo:\n` +
            `• Número de teléfono celular:\n` +
            `• Dirección exacta (con barrio y detalles como torre/apto):\n` +
            `• Ciudad y departamento:\n` +
            `• Tono de luz elegido (Cálida o Blanca):`,
        };
      }

      // 3. Deseo de comprar Combo 1 (x1)
      const wantsSingle =
        /\b(quiero|mandame|aparta|deseo|llevar|pedir|comprar)\b.*(una|1|sola|solo|primera|opcion\s*1|unidad|1\s*unidad|10\s*metros|10m)/i.test(text) ||
        /\b(solo\s*una|una\s*sola|1\s*unidad|solo\s*1|una\s*unidad|10\s*metros)\b/i.test(text) ||
        ((text === '1' || text === 'una' || text === 'el uno' || text === 'la primera') && currentState === 'PRICING_SENT');

      if (wantsSingle) {
        const productDesc = `${combo1.label} ($${combo1.price.toLocaleString('es-CO')})`;
        this.customerProduct.set(jid, { description: productDesc, price: combo1.price });
        this.setSelectedCombo(jid, combo1.id);


        return {
          matched: true,
          intent: 'SELECT_SINGLE',
          nextState: 'DATA_REQUESTED',
          response:
            `Con mucho gusto. Se lo programamos hoy mismo por *$${combo1.price.toLocaleString('es-CO')}* con Envío Gratis y pago contra entrega 📦🚚\n\n` +
            `Por favor facilítenos sus datos para el despacho:\n` +
            `• Nombre y apellido:\n` +
            `• Ciudad/Municipio y Departamento:\n` +
            `• Dirección (o si prefiere oficina Interrapidísimo):\n` +
            `• Número de celular:`,
        };
      }

      // 4. Aceptación general de pedido
      const generalAcceptWords = [
        'si apartamelo', 'si apartamela', 'mandamelo', 'mandamela', 'quiero pedir',
        'quiero comprar', 'si dale', 'apartamela', 'apartamelo', 'si quiero'
      ];
      if (generalAcceptWords.some((w) => text === w || text.includes(w))) {
        if (!this.customerProduct.has(jid)) {
          this.customerProduct.set(jid, {
            description: `${combo1.label} ($${combo1.price.toLocaleString('es-CO')})`,
            price: combo1.price,
          });
          this.setSelectedCombo(jid, combo1.id);
        }
        return {
          matched: true,
          intent: 'ACCEPT_ORDER',
          nextState: 'DATA_REQUESTED',
          response:
            `Con mucho gusto. Le dejamos coordinado el despacho hoy con Envío Gratis y pago contra entrega 📦🚚\n\n` +
            `Por favor facilítenos sus datos:\n` +
            `• Nombre y apellido:\n` +
            `• Ciudad/Municipio y Departamento:\n` +
            `• Dirección (o si prefiere oficina Interrapidísimo):\n` +
            `• Número de celular:`,
        };
      }
    }

    // =========================================================================
    // 4. CONSULTA DE PRECIOS, INFORMACIÓN O SALUDO (ADAPTA AL ESTADO)
    // =========================================================================
    const priceWords = [
      'precio', 'precios', 'cuanto vale', 'cuanto cuesta', 'costo', 'valor',
      'a como', 'a cuanto', 'que vale', 'que precio', 'cual es el precio', 'cual es el costo',
      'cuanto cuesta la base', 'que vale la base'
    ];
    const hasPrice = priceWords.some((w) => text.includes(w));

    const infoWords = [
      'informacion', 'mas informacion', 'info', 'asesoria', 'quiero saber', 'interesa',
      'quiero mas informacion', 'me da informacion', 'me regala informacion'
    ];
    const hasInfo = infoWords.some((w) => text.includes(w));

    const greetingWords = [
      'hola', 'buenas', 'buen dia', 'buenos dias', 'buenas tardes', 'buenas noches', 'hola?', 'muy buenas tardes', 'muy buenas tarde'
    ];
    const isGreeting = greetingWords.some((w) => text === w || (text.startsWith(w) && text.length <= w.length + 3));

    // Si la conversación ya fue iniciada previamente o no está en NEW
    if (this.hasBeenGreeted(jid) || currentState !== 'NEW') {
      if (hasPrice) {
        return {
          matched: true,
          intent: 'PRICE_REMINDER',
          response:
            `Con gusto te confirmo nuestros precios fijos con Envío Gratis y Pago Contra Entrega 🚚:\n\n` +
            `${pricingListText}\n\n` +
            `¡El más pedido para fachadas y balcones es el *Combo Estrella de 2 unidades por $79.900* (ahorras $30.000)! ⭐ ¿Deseas que te lo dejemos apartado?`,
        };
      }
      if (hasInfo) {
        return {
          matched: true,
          intent: 'INFO_REMINDER',
          response:
            `Nuestra *${product.name}* cuenta con 100 bombillos LED brillantes, panel solar de recarga automática, sensor inteligente que se enciende solo al anochecer y certificación IP65 resistente a lluvias 🌧️💡\n\n` +
            `${pricingListText}\n\n` +
            `¿Prefieres en luz *Cálida* o *Blanca*? ¿O deseas aprovechar la promo del Combo Estrella de 2 unidades?`,
        };
      }
      if (isGreeting) {
        return {
          matched: true,
          intent: 'GREETING_ACTIVE',
          response: `Por aquí continúo a tu orden 😊 ¿Deseas que coordinemos tu entrega o tienes alguna inquietud sobre las luces solares?`,
        };
      }
    }

    // Si es contacto por primera vez (NEW y sin saludo previo)
    this.markGreeted(jid);
    if (hasInfo) {
      return {
        matched: true,
        intent: 'INFO',
        nextState: 'PRICING_SENT',
        mediaPath: productMedia,
        response:
          `¡Hola! Soy Maria Paula de MoraMerco 😊 Te presento nuestra *${product.name}* 🎄✨\n\n` +
          `✔️ 100 bombillos LED brillantes y duraderos (10 metros)\n` +
          `✔️ Panel solar de carga automática (Cero consumo en tu factura)\n` +
          `✔️ Encendido automático al anochecer con sensor inteligente\n` +
          `✔️ Totalmente resistente al clima y lluvias (IP65)\n` +
          `✔️ Tonos disponibles: Cálida (más recomendada) y Blanca\n\n` +
          `🚚 *Envío GRATIS y Pago Contra Entrega en efectivo:*\n` +
          `${pricingListText}\n\n` +
          `¿Te gustaría en luz *Cálida* o *Blanca*? ¿O te dejamos apartado el Combo Estrella de 2 unidades? ⭐`,
      };
    }

    if (hasPrice) {
      return {
        matched: true,
        intent: 'PRICE',
        nextState: 'PRICING_SENT',
        mediaPath: productMedia,
        response:
          `¡Hola! Soy Maria Paula de MoraMerco 😊 Con mucho gusto te comparto nuestra lista oficial de precios 🎄✨\n\n` +
          `🚚 *Envío GRATIS a toda Colombia y Pago Contra Entrega en efectivo:*\n` +
          `${pricingListText}\n\n` +
          `Te recomendamos especialmente el *Combo Estrella de 2 unidades por $79.900* (ahorras $30.000 y cubres 20 metros) ⭐ ¿Cuál de las opciones te dejamos programada?`,
      };
    }

    if (isGreeting) {
      return {
        matched: true,
        intent: 'GREETING',
        nextState: 'PRICING_SENT',
        mediaPath: productMedia,
        response:
          `¡Hola! Soy Maria Paula de MoraMerco 😊 Con mucho gusto te atiendo sobre nuestra *${product.name}* 🎄✨\n\n` +
          `Cuenta con panel solar recargable (cero consumo de luz), sensor automático al anochecer y resistencia total a lluvias IP65 🌧️💡\n\n` +
          `🚚 *Envío GRATIS y Pago Contra Entrega en efectivo:*\n` +
          `${pricingListText}\n\n` +
          `¿Te gustaría en luz *Cálida* o *Blanca*? ¿O deseas aprovechar la promo del Combo Estrella de 2 unidades? ⭐`,
      };
    }


    // A. RESISTENCIA A LA LLUVIA / INTEMPERIE / DÍAS NUBLADOS (LUCES SOLARES)
    const rainAndWeatherWords = [
      'llueve', 'lluvia', 'lluvias', 'nublado', 'sol', 'si llueve', 'si esta nublado', 'agua',
      'impermeable', 'resiste agua', 'intemperie', 'exterior', 'se moja', 'ip65'
    ];
    if (rainAndWeatherWords.some((w) => text.includes(w))) {
      return {
        matched: true,
        intent: 'WEATHER_AND_RAIN_RESISTANCE',
        response:
          `¡Totalmente resistentes! Cuentan con certificación IP65 para intemperie, soportando lluvias y sol intenso sin dañarse 🌧️☀️\n\n` +
          `Además, el panel cuenta con batería interna de litio que almacena energía incluso en días nublados o con lluvia suave, encendiendo normal durante la noche ✨\n\n` +
          `¿Deseas 1 Unidad ($54.900) o aprovechar el Combo Estrella de 2 Unidades ($79.900)?`,
      };
    }

    // B. CÓMO FUNCIONA / SENSOR INTELIGENTE / CERO CONSUMO
    const solarFunctionWords = [
      'como funciona', 'se prende sola', 'sensor', 'como carga', 'cuanto dura la bateria',
      'panel solar', 'consume luz', 'recargable', 'carga solar'
    ];
    if (solarFunctionWords.some((w) => text.includes(w))) {
      return {
        matched: true,
        intent: 'HOW_IT_WORKS_SOLAR',
        response:
          `Cero consumo de electricidad ⚡ Su panel solar recarga la batería interna de litio durante el día con la luz del sol, y su sensor inteligente las enciende automáticamente al anochecer y las apaga al amanecer ✨\n\n` +
          `¿Prefieres en tono de luz *Cálida* (más acogedora y decorativa) o *Blanca*?`,
      };
    }

    // C. LONGITUD, MEDIDAS Y BOMBILLOS LED
    const lengthWords = [
      'cuanto mide', 'medidas', 'longitud', 'largo', 'metros', 'cuantos bombillos', 'cuantos leds', 'leds', 'tamano'
    ];
    if (lengthWords.some((w) => text.includes(w))) {
      return {
        matched: true,
        intent: 'MEASUREMENTS_AND_LEDS',
        response:
          `Cada extensión tiene 10 metros de longitud y 100 bombillos LED de alta luminosidad ✨ Con el Combo Estrella de 2 unidades te llevas 20 metros y 200 bombillos con un ahorro de $30.000 🎄\n\n` +
          `¿Para qué espacio las planeas colocar? ¿Fachada, jardín o balcón?`,
      };
    }

    // D. TONOS DE LUZ DISPONIBLES (CÁLIDA O BLANCA)
    const tonesWords = [
      'colores', 'color', 'tonos', 'tono', 'calida', 'blanca', 'amarilla', 'luz calida', 'luz blanca'
    ];
    if (tonesWords.some((w) => text.includes(w))) {
      return {
        matched: true,
        intent: 'LIGHT_TONES',
        response:
          `Tenemos disponibles los 2 tonos:\n` +
          `✨ *Luz Cálida:* La más recomendada y vendida, crea un ambiente navideño súper acogedor y elegante.\n` +
          `💡 *Luz Blanca:* Iluminación nítida y brillante de alta visibilidad.\n\n` +
          `¿Cuál de los dos tonos te gusta más para tu hogar?`,
      };
    }


    // E. GARANTÍA Y CONFIANZA (ANTI-ESTAFA - TRANSVERSAL)
    const trustWords = [
      'garantia', 'es seguro', 'confiable', 'estafa', 'como se que llega',
      'testimonios', 'seguridad', 'tienen garantia', 'como se que no es estafa', 'abrir antes', 'revisar antes'
    ];
    if (trustWords.some((w) => text.includes(w))) {
      return {
        matched: true,
        intent: 'WARRANTY_AND_TRUST',
        response:
          `Total tranquilidad: abona el valor en efectivo al recibir el producto en sus manos con la transportadora y cuenta con garantía de 30 días de fábrica directa 🙌\n\n` +
          `¿En qué ciudad o municipio se encuentra para su entrega?`,
      };
    }

    // F. MEDIOS DE PAGO (TRANSVERSAL)
    const paymentWords = [
      'medios de pago', 'formas de pago', 'como se paga', 'metodo de pago', 'metodos de pago',
      'nequi', 'bancolombia', 'daviplata', 'transferencia', 'tarjeta', 'efectivo', 'contraentrega'
    ];
    if (paymentWords.some((w) => text.includes(w))) {
      return {
        matched: true,
        intent: 'PAYMENT_METHODS',
        response:
          `Cancela contra entrega en efectivo al recibir en su puerta o en oficina 💵 (También puede por Nequi/Bancolombia al momento de recibir si el repartidor lo autoriza).\n\n` +
          `¿Desea ${combo1.label} ($${combo1.price.toLocaleString('es-CO')}) o aprovechar ${combo2.label} ($${combo2.price.toLocaleString('es-CO')})?`,
      };
    }

    // H. UBICACIÓN Y BODEGAS (TRANSVERSAL)
    const locationWords = [
      'donde estan ubicados', 'donde queda la tienda', 'tienda fisica', 'tienen local',
      'donde estan', 'de que ciudad son', 'de donde son'
    ];
    if (locationWords.some((w) => text.includes(w))) {
      return {
        matched: true,
        intent: 'LOCATION',
        response:
          `Despachamos desde nuestras bodegas en Bogotá y Medellín a todo el país 🇨🇴🚚 Envío Gratis y paga al recibir.\n\n` +
          `¿En qué ciudad o municipio se encuentra?`,
      };
    }

    // I. ASESOR HUMANO (TRANSVERSAL)
    const humanWords = [
      'asesor humano', 'persona real', 'hablar con una persona', 'humano', 'alguien real', 'asesor'
    ];
    if (humanWords.some((w) => text === w || (text.includes(w) && text.split(' ').length <= 10))) {
      return {
        matched: true,
        intent: 'HUMAN_AGENT',
        response:
          `Con mucho gusto, le saluda Maria Paula, asesora de MoraMerco 😊 ¿En qué le puedo colaborar?`,
      };
    }

    // K. ENVÍO Y TIEMPO DE ENTREGA (TRANSVERSAL)
    const shippingWords = [
      'cuanto demora', 'cuanto tarda', 'tiempo de entrega', 'cuando llega', 'cuantos dias se demora',
      'costo del envio', 'cuanto vale el envio', 'el envio es gratis'
    ];
    if (shippingWords.some((w) => text.includes(w))) {
      return {
        matched: true,
        intent: 'SHIPPING',
        response:
          `El envío es *100% GRATIS* a toda Colombia y paga al recibir 🙌 Tarda de 2 a 4 días hábiles mediante Interrapidísimo o Coordinadora 📦\n\n` +
          `¿En qué ciudad o municipio se encuentra?`,
      };
    }

    // L. RECLAMO EN OFICINA INTERRAPIDÍSIMO (TRANSVERSAL)
    const officeWords = [
      'oficina interrapidisimo', 'reclamo en oficina', 'recoger en oficina', 'oficina transportadora',
      'se puede recoger', 'recogerla en oficina', 'enviar a oficina'
    ];
    if (officeWords.some((w) => text.includes(w))) {
      return {
        matched: true,
        intent: 'OFFICE_DELIVERY_FAQ',
        response:
          `¡Claro que sí! Puede solicitar despacho con opción de *Reclamo en Oficina de Interrapidísimo* en su municipio. El envío sigue siendo 100% GRATIS y cancela en efectivo en la misma oficina al retirar su paquete 🏢📦\n\n` +
          `¿En qué municipio o departamento desea reclamar?`,
      };
    }

    // M. DESCUENTOS Y REBAJAS (TRANSVERSAL)
    const discountWords = [
      'descuento', 'rebaja', 'cuanto es lo minimo', 'lo minimo', 'me rebaja', 'me hace descuento', 'rebajas'
    ];
    if (discountWords.some((w) => text.includes(w))) {
      return {
        matched: true,
        intent: 'DISCOUNTS_FAQ',
        response:
          `Nuestros mejores precios oficiales con Envío Gratis y Pago Contra Entrega son:\n\n` +
          `${pricingListText}\n\n` +
          `¿Cuál de las opciones desea que le dejemos programada?`,
      };
    }

    // N. DESISTIMIENTO O "LO VOY A PENSAR" (TRANSVERSAL)
    const declineWords = [
      'no gracias', 'muy caro', 'caro', 'pensar', 'pensarlo', 'voy a pensarlo',
      'ya no quiero', 'luego aviso', 'gracias no'
    ];
    if (declineWords.some((w) => text === w || (text.includes(w) && text.split(' ').length <= 6))) {
      return {
        matched: true,
        intent: 'DECLINED_OR_THINK',
        response:
          `Comprendemos totalmente 😊 Si más adelante desea coordinar su entrega o resolver cualquier duda sobre nuestros productos, con el mayor gusto quedamos a su entera disposición. ¡Que tenga un excelente día!`,
      };
    }

    // O. AGRADECIMIENTOS (TRANSVERSAL)
    const thanksWords = ['gracias', 'muchas gracias', 'mil gracias', 'muy amable'];
    if (thanksWords.some((w) => text === w || text.startsWith(w))) {
      return {
        matched: true,
        intent: 'THANKS',
        response:
          `¡Con el mayor gusto! Es un placer atenderle 😊 Quedo a su disposición.`,
      };
    }

    // No coincidió con una respuesta rápida local -> Dejar a Gemini AI
    return { matched: false };
  }
}
