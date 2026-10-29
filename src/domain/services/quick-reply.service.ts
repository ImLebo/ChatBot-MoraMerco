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
    if (state.selectedTone !== undefined) current.selectedTone = state.selectedTone;
    if (state.lastAnsweredIntent !== undefined) current.lastAnsweredIntent = state.lastAnsweredIntent;
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

  public getSelectedTone(jid: string): 'Cálida' | 'Blanca' | 'Multicolor' | string | undefined {
    return this.chatStates.get(jid)?.selectedTone;
  }

  public setSelectedTone(jid: string, tone: 'Cálida' | 'Blanca' | 'Multicolor' | string): void {
    const current = this.chatStates.get(jid) || { stage: 'NEW' };
    current.selectedTone = tone;
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
        const highlight = idx === 1 ? ' 🔥 *¡MÁS VENDIDO!*' : '';
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

    // Si el texto es una pregunta o consulta sobre el combo (ej: "como es eso", "¿qué trae?", "¿son estrellas?")
    // NUNCA interpretarlo como una decisión de compra!
    const isComboQuestion =
      /\b(como\s*es|que\s*es|como\s*asi|que\s*trae|de\s*que\s*trata|son\s*estrellas|tienen\s*forma|como\s*son|que\s*incluye)\b/i.test(text) ||
      text.includes('como es eso') ||
      text.includes('que es eso') ||
      text.includes('como es el combo');

    if (isComboQuestion || FuzzyMatcherService.isIndecisiveOrCombineTones(rawText)) {
      return null;
    }

    const isQuestionOrDoubt = FuzzyMatcherService.hasQuestionOrDoubt(rawText);

    // Verbos o expresiones de compra o cambio de opinión
    const hasChangeVerb =
      /\b(mejor|cambiame|cambiar|prefiero|en\s*vez\s*de|mas\s*bien|no\s*quiero|cambio|corrijo|corregir|modificar|modificame|ponme|dejame|anotame|apuntame|mandame|deme|dame|quiero|voy\s*a\s*llevar|voy\s*a\s*comprar|aparta|llevar|enviame|despachame|pedir|comprar|compro|llevo|luego)\b/i.test(text);

    // Si es una pregunta de dudas/precio (ej: "¿cuanto cuesta el combo 2?"), NO es selección de compra a menos que use verbo de compra
    if (isQuestionOrDoubt && !hasChangeVerb) {
      return null;
    }

    const isChangeOfMind =
      /\b(mejor|cambiame|cambiar|prefiero|en\s*vez\s*de|mas\s*bien|no\s*quiero|cambio|corrijo|corregir|modificar|modificame|en\s*cambio|luego)\b/i.test(text);

    const combos = product.pricingCombos;
    const combo1 = combos[0];
    const combo2 = combos[1];
    const combo3 = combos[2];

    // 1. Detección de Combo 3 (Mega Cobertura x3 / 30 metros / $109.900)
    if (combo3) {
      const wantsCombo3 =
        /\b(combo\s*x?\s*3|kit\s*x?\s*3|3\s*unidades|tres\s*unidades|30\s*metros|30m|las\s*3|las\s*tres|los\s*3|los\s*tres|mega\s*cobertura|109\.?900|109k|109900|voy\s*a\s*comprar\s*3|comprar\s*3|compro\s*3|llevo\s*3|luego\s*3|mejor\s*3)\b/i.test(text) ||
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

    // 2. Detección de Combo 2 (Combo Dúo / 2 Unidades / 20 metros / $79.900)
    if (combo2) {
      const mentionsCombo2Explicit =
        /\b(combo\s*duo|duo|combo\s*x?\s*2|kit\s*x?\s*2|2\s*unidades|dos\s*unidades|20\s*metros|20m|las\s*2|las\s*dos|los\s*2|los\s*dos|ambas|ambos|dos\s*luces|dos\s*extensiones|79\.?900|79k|79900|combo\s*estrella|voy\s*a\s*comprar\s*2|comprar\s*2|compro\s*2|llevo\s*2)\b/i.test(text);

      const wantsCombo2 =
        (mentionsCombo2Explicit && !isQuestionOrDoubt) ||
        (hasChangeVerb && /\b(2|dos|duo|20\s*metros|las\s*dos|las\s*2|combo\s*2|combo\s*duo)\b/i.test(text)) ||
        (/\b(quiero|mandame|deme|dame|llevar|pedir|comprar|favor|prefiero|anotame|aparta)\b.*(dos|2|duo|ambas|ambos|combo\s*2|opcion\s*2)/i.test(text) && !text.includes('solo una') && !text.includes('solo 1')) ||
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
        /\b(ambas|ambos|las\s*dos|las\s*2|los\s*dos|los\s*2|2\s*unidades|dos\s*unidades|3\s*unidades|tres\s*unidades|duo)\b/i.test(text) ||
        text.includes('combo 2') || text.includes('combo duo') || text.includes('combo 3');

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
   * ÁRBOL DE DECISIÓN INTELIGENTE (Decision Tree)
   * Evalúa qué intención pesa más en el contexto del chat para responder con máxima calidez,
   * sin reprocesos ni bucles, y orientando siempre hacia el cierre con pago contra entrega.
   */
  public matchQuickReply(rawText: string, jid: string, productConfig?: ProductConfig): QuickReplyResult {
    const text = this.normalizeText(rawText);
    const currentState = this.getState(jid);

    // Determinar producto activo en contexto
    const activeSlug = this.getActiveProduct(jid);
    const product = productConfig || (activeSlug ? getProductBySlug(activeSlug) : undefined) || DEFAULT_PRODUCT;

    // Ruta de la imagen del producto activo
    let productMedia: string | undefined;
    if (product.primaryAssetPath && fs.existsSync(product.primaryAssetPath)) {
      productMedia = product.primaryAssetPath;
    } else {
      const solarImg = path.resolve(process.cwd(), 'assets/img_luz_solar/img_luz_solar_1.jpg');
      productMedia = fs.existsSync(solarImg) ? solarImg : undefined;
    }

    // Combos dinámicos del producto
    const combos = product.pricingCombos;
    const combo1 = combos[0] || { id: 'combo-1', label: 'Opción 1 Unidad (10m - 100 LEDs)', price: 54900 };
    const combo2 = combos[1] || combo1;
    const combo3 = combos[2];
    const pricingListText = this.formatPricingList(product);

    // =========================================================================
    // NODO 0: SELECCIÓN DE PRODUCTO DESDE MENÚ (ESTADO AWAITING_PRODUCT)
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
          `Tonos disponibles: *Cálida*, *Blanca* y *Multicolor* 🌈\n\n` +
          `🚚 *Envío GRATIS y Pago Contra Entrega en efectivo:*\n` +
          `${pricingListText}\n\n` +
          `¿Cuál de los 3 tonos te gusta más para tu hogar? ¿O te dejamos apartado el Combo Dúo de 2 unidades ($79.900)? 🎄`,
      };
    }

    // =========================================================================
    // NODO 1 (PESO MÁXIMO): CONFIRMACIÓN DIRECTA DE PEDIDO
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
      const destinationText = savedData?.city ? `hacia ${savedData.city}` : 'a tu domicilio';
      const officeNote = savedData?.isOfficeDelivery ? ' Recuerda que tu paquete llegará para reclamar en oficina de Interrapidísimo.' : '';

      return {
        matched: true,
        intent: 'CONFIRM_ORDER',
        nextState: 'ORDER_CONFIRMED',
        response:
          `¡Pedido 100% CONFIRMADO! 📦🎉\n\n` +
          `Entra a preparación para despacho hoy ${destinationText}. Te llegará en un plazo de 2 a 4 días hábiles y pagas en efectivo directamente al repartidor al recibir 🙌${officeNote}\n\n` +
          `Apenas la transportadora genere tu número de guía te lo compartiremos por aquí para que le hagas seguimiento. ¡Muchas gracias por elegir a MoraMerco! 😊✨`,
      };
    }

    // =========================================================================
    // NODO 2: CONFUSIÓN "COMBO DE ESTRELLAS" (LA GENTE PIENSA QUE SON ESTRELLAS)
    // =========================================================================
    const mentionsStars = /\b(estrellas?|combo\s*de\s*estrellas?)\b/i.test(text);
    const asksAboutComboOrStars =
      mentionsStars &&
      (/\b(como\s*es|que\s*es|son|tienen\s*forma|figura|como\s*asi|de\s*que|que\s*trae|como\s*vienen)\b/i.test(text) ||
       text.includes('como es eso') || text.includes('como es el combo'));

    if (asksAboutComboOrStars) {
      return {
        matched: true,
        intent: 'EXPLAIN_COMBO_DUO_NOT_STARS',
        response:
          `¡Con mucho gusto te aclaro! 😊 No tienen forma de estrellas, son bombillitos LED tipo guirnalda lineal de 10 metros (100 LEDs por extensión) con panel solar recargable 💡✨\n\n` +
          `Le llamamos *Combo Dúo* porque te incluye 2 extensiones completas (20 metros y 200 LEDs en total). Cada una viene con su propio panel solar y sensor automático para encenderse solitas al anochecer 🌧️\n\n` +
          `Te sale en *$79.900* con Envío Gratis y pago contra entrega (ahorras $30.000). ¿Te gustaría en luz *Cálida*, *Blanca* o *Multicolor*? 🎄`,
      };
    }

    // =========================================================================
    // NODO 3: DUDAS DE FORMA Y USO (CHORRITOS, CASCADA, ÁRBOL, BALCÓN)
    // =========================================================================
    const mentionsShapeOrPlacement =
      /\b(chorritos?|cascada|cortina|lluvia\s*de\s*luces|arbol|balcon|para\s*el\s*arbol|en\s*el\s*arbol|para\s*el\s*balcon)\b/i.test(text);

    if (mentionsShapeOrPlacement) {
      return {
        matched: true,
        intent: 'SHAPE_AND_PLACEMENT_FAQ',
        response:
          `¡Hola! Te cuento con todo gusto: son extensiones de guirnalda lineal de 10 metros con 100 LEDs solares 💡\n\n` +
          `✨ *Para el balcón y barandas:* Quedan preciosas porque las puedes bordear o enrollar fácilmente.\n` +
          `🎄 *Para el árbol de Navidad:* Son perfectas, las vas envolviendo entre las ramas y como son solares, ¡no necesitas cables a la pared ni gastas un peso de luz!\n` +
          `🌧️ No son tipo cortina o chorritos que cuelgan verticalmente, sino cable lineal súper flexible y totalmente resistente a lluvias IP65.\n\n` +
          `¿Te gustaría ver fotos o prefieres en tono *Cálida*, *Blanca* o *Multicolor*? 🌈`,
      };
    }

    // =========================================================================
    // NODO 4: SOLICITUD DE FOTOS / IMÁGENES ("verlas", "quiero ver las luces")
    // =========================================================================
    const photoWords = [
      'foto', 'fotos', 'fotp', 'fotico', 'foticos', 'fotografia', 'imagen', 'imagenes',
      'video', 'videos', 'catalogo', 'envieme foto', 'mandeme foto', 'puede enviar foto',
      'tienen fotos', 'ver foto', 'ver como es', 'como es', 'mostrar foto', 'enviar fotp',
      'envieme fotos', 'mandeme fotos', 'verlas', 'verla', 'ver las luces', 'quiero verlas',
      'me gustaria verlas', 'gustaria verlas', 'como se ven', 'mostrar las luces'
    ];
    const isPhotoRequest = photoWords.some((w) => text === w || text.includes(w));

    if (isPhotoRequest) {
      // Si ya está en datos, no reiniciar precios
      if (currentState === 'DATA_REQUESTED' || currentState === 'CONFIRMATION_PENDING') {
        const saved = this.customerData.get(jid);
        const namePart = saved?.name ? `, ${saved.name.split(' ')[0]}` : '';
        const destPart = saved?.city ? ` en ${saved.city}` : '';

        return {
          matched: true,
          intent: 'SEND_PHOTO_DATA_PENDING',
          mediaPath: productMedia,
          response:
            `Con mucho gusto${namePart}, aquí te comparto la foto 📸✨\n\n` +
            `Es nuestra *${product.name}*: 100 bombillos LED con panel solar automático de recarga diurna y certificación impermeable IP65 para exteriores 🌧️💡\n\n` +
            `Continuamos atentos a tus datos de entrega${destPart} para programar tu despacho hoy con Envío Gratis 🚚📦`,
        };
      }

      this.markGreeted(jid);
      return {
        matched: true,
        intent: 'SEND_PHOTO',
        nextState: 'PRICING_SENT',
        mediaPath: productMedia,
        response:
          `¡Con mucho gusto te comparto la foto! 📸✨\n\n` +
          `Es nuestra *${product.name}*: guirnalda de 10 metros con 100 bombillos LED brillantes, panel solar recargable (cero consumo de luz) y sensor que se prende solito al anochecer 🌧️💡\n\n` +
          `Disponibles en: ✨ *Luz Cálida*, 💡 *Luz Blanca* y 🌈 *Multicolor*.\n\n` +
          `🚚 *Precios con Envío GRATIS y Pago Contra Entrega en efectivo:*\n` +
          `${pricingListText}\n\n` +
          `¿Cuál de los 3 tonos te gusta más para tu hogar? ¿O te dejamos apartado el Combo Dúo de 2 unidades ($79.900)? 🎄`,
      };
    }

    // =========================================================================
    // NODO 5: RECEPCIÓN Y VALIDACIÓN DE DATOS DE ENVÍO
    // =========================================================================
    if (DataValidatorService.isLikelyShippingData(rawText) || currentState === 'DATA_REQUESTED' || currentState === 'CONFIRMATION_PENDING') {
      if (DataValidatorService.isLikelyShippingData(rawText)) {
        const previousData = this.customerData.get(jid);
        const validation = DataValidatorService.validate(rawText, previousData);

        // Detectar si también especificó tonos combinados o un tono individual en el mensaje de datos
        const combinedTone = FuzzyMatcherService.extractCombinedTones(rawText);
        if (combinedTone) {
          this.setSelectedTone(jid, combinedTone);
        } else {
          const toneDetectedInData = FuzzyMatcherService.detectToneChoice(rawText);
          if (toneDetectedInData) {
            this.setSelectedTone(jid, toneDetectedInData);
          }
        }

        this.customerData.set(jid, validation);

        let doubtPrefix = '';
        if (validation.hasPendingDoubt && validation.doubtAnswer) {
          doubtPrefix = `${validation.doubtAnswer}\n\n`;
        }

        if (validation.isValid) {
          const selectedDesc = this.customerProduct.get(jid)?.description || `${combo1.label} ($${combo1.price.toLocaleString('es-CO')})`;
          const currentTone = this.getSelectedTone(jid) || 'Cálida';
          const addressLine = validation.isOfficeDelivery
            ? `• Entrega: ${validation.address} 🏢 (Reclamo en Oficina)`
            : `• Dirección: ${validation.address} 🏠`;

          const destDisplay = validation.neighborhood
            ? `${validation.city} (${validation.neighborhood})`
            : validation.city;

          return {
            matched: true,
            intent: 'DATA_RECEIVED',
            nextState: 'CONFIRMATION_PENDING',
            buttons: [{ id: 'CONFIRMAR', displayText: '✅ CONFIRMAR PEDIDO' }],
            response:
              `${doubtPrefix}` +
              `¡Perfecto! Tus datos están completos y verificados para despacho 📦✨\n\n` +
              `*RESUMEN DE TU PEDIDO:* \n` +
              `• Producto: ${selectedDesc}\n` +
              `• Tono elegido: Luz *${currentTone}* ✨\n` +
              `• Recibe: ${validation.name} (${validation.phone})\n` +
              `• Destino: ${destDisplay}\n` +
              `${addressLine}\n` +
              `• Pago: Contra entrega en efectivo (Envío Gratis 🚚)\n\n` +
              `👇 Toca *CONFIRMAR* o responde *CONFIRMAR* para despachar hoy mismo:`,
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

      // Si el cliente en etapa de datos pregunta por precio o dudas:
      if (FuzzyMatcherService.hasQuestionOrDoubt(rawText)) {
        const topic = FuzzyMatcherService.detectDoubtTopic(rawText);
        const answer = FuzzyMatcherService.getDoubtAnswer(topic);
        const previousData = this.customerData.get(jid);

        let nextPrompt = 'Continuamos muy atentos a tus datos de entrega (Nombre, Ciudad, Dirección, Celular) para programarte el despacho hoy mismo 📦🚚';
        if (previousData?.isValid) {
          nextPrompt = 'Tus datos de despacho ya se encuentran registrados ✅ ¿Deseas que te confirmemos el envío hoy mismo?';
        } else if (previousData && previousData.missingFields && previousData.missingFields.length > 0) {
          nextPrompt = `Para programar tu entrega hoy con Envío Gratis, por favor compártenos:\n${previousData.missingFields.map((f) => `• ${f}`).join('\n')}`;
        }

        return {
          matched: true,
          intent: 'DOUBT_IN_DATA_STATE',
          nextState: currentState,
          response: `${answer}\n\n${nextPrompt}`,
        };
      }
    }

    // =========================================================================
    // NODO 6: DETECCIÓN DE SELECCIÓN DE COMBO / COMPRA
    // =========================================================================
    const detectedCombo = this.detectComboSelection(rawText, product, currentState);

    if (detectedCombo) {
      this.setSelectedCombo(jid, detectedCombo.combo.id);
      this.customerProduct.set(jid, {
        description: detectedCombo.description,
        price: detectedCombo.combo.price,
      });

      const savedData = this.customerData.get(jid);
      const chosenTone = this.getSelectedTone(jid);
      const tonePrompt = chosenTone ? `Tono: *${chosenTone}*` : '• Tono de luz elegido (Cálida, Blanca o Multicolor):';

      // Si el cliente ya tenía datos completos:
      if (savedData?.isValid) {
        const addressLine = savedData.isOfficeDelivery
          ? `• Entrega: ${savedData.address} 🏢`
          : `• Dirección: ${savedData.address} 🏠`;
        const destDisplay = savedData.neighborhood
          ? `${savedData.city} (${savedData.neighborhood})`
          : savedData.city;

        const heading = detectedCombo.isChangeOfMind
          ? `¡Listo, con mucho gusto! Te cambiamos tu pedido a *${detectedCombo.description}* 🔄📦`
          : `¡Excelente elección! Te dejamos registrado el *${detectedCombo.description}* 📦✨`;

        return {
          matched: true,
          intent: 'COMBO_CHANGE_UPDATED',
          nextState: 'CONFIRMATION_PENDING',
          buttons: [{ id: 'CONFIRMAR', displayText: '✅ CONFIRMAR PEDIDO' }],
          response:
            `${heading}\n\n` +
            `*RESUMEN ACTUALIZADO:* \n` +
            `• Pedido: ${detectedCombo.description} (Luz ${chosenTone || 'Cálida'})\n` +
            `• Recibe: ${savedData.name} (${savedData.phone})\n` +
            `• Destino: ${destDisplay}\n` +
            `${addressLine}\n` +
            `• Pago: Contra entrega en efectivo (Envío Gratis 🚚)\n\n` +
            `👇 Toca *CONFIRMAR* o responde *CONFIRMAR* para despachar hoy:`,
        };
      }

      // Upsell suave si piden 1 unidad
      if (detectedCombo.combo.id === 'combo-1' && !savedData?.isValid) {
        return {
          matched: true,
          intent: 'COMBO_1_UPSELL_GENTLE',
          nextState: 'DATA_REQUESTED',
          buttons: [
            { id: 'CONFIRM_COMBO_2', displayText: '🎄 PROMO 2 UNIDADES ($79.900)' },
            { id: 'CONFIRM_COMBO_1', displayText: '1 UNIDAD ($54.900)' },
          ],
          response:
            `Claro que sí, con mucho gusto te despacho 1 unidad por $54.900 😊\n\n` +
            `Solo ten presente que por solo $25.000 adicionales te llevas la segunda (quedan las 2 en *$79.900* - te ahorras $30.000) y aseguras cubrir todo el balcón o fachada 🎄✨\n\n` +
            `¿Prefieres aprovechar la promo de las 2 unidades ($79.900) o dejamos solo la individual ($54.900)?\n\n` +
            `*(Si dejas 1 unidad, indícanos si la prefieres en Cálida, Blanca o Multicolor y tus datos para el envío 🚚)*`,
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
          `Para programarte el despacho hoy mismo, por favor compártenos en un solo mensaje:\n` +
          `• Nombre completo:\n` +
          `• Número de teléfono celular:\n` +
          `• Dirección exacta (con barrio y detalles como torre/apto):\n` +
          `• Ciudad y departamento:\n` +
          `${tonePrompt}`,
      };
    }

    // =========================================================================
    // NODO 7: MULTI-INTENCIÓN: TONOS + PRECIO EN EL MISMO MENSAJE
    // =========================================================================
    // Ejemplo: "¿Qué tonos de luz tienen disponibles? Que presio tienen"
    const hasPriceWord = /\b(precio|precios|cuanto\s*vale|cuanto\s*cuesta|costo|valor|a\s*como|a\s*cuanto|que\s*vale|que\s*precio|presio)\b/i.test(text);
    const hasToneInquiryWord = /\b(que\s*tonos|cuales\s*tonos|tonos\s*de\s*luz|que\s*colores|cuales\s*colores|colores\s*tienen)\b/i.test(text);

    if (hasPriceWord && hasToneInquiryWord) {
      this.markGreeted(jid);
      return {
        matched: true,
        intent: 'TONES_AND_PRICES_COMBINED',
        nextState: 'PRICING_SENT',
        response:
          `¡Con mucho gusto! Te comparto los tonos disponibles y nuestra lista de precios oficial 🎄✨\n\n` +
          `🌈 *Tonos de luz disponibles:*\n` +
          `✨ *Luz Cálida:* La más recomendada y vendida, crea un ambiente navideño súper acogedor y elegante.\n` +
          `💡 *Luz Blanca:* Iluminación nítida, moderna y brillante de alta visibilidad.\n` +
          `🌈 *Multicolor:* Festiva, colorida y alegre con tonos navideños tradicionales.\n\n` +
          `🚚 *Precios con Envío GRATIS y Pago Contra Entrega en efectivo:*\n` +
          `${pricingListText}\n\n` +
          `¿Cuál de los 3 tonos te gusta más para tu hogar? ¿O prefieres aprovechar el *Combo Dúo de 2 unidades por $79.900* (ahorras $30.000)? ⭐`,
      };
    }

    // =========================================================================
    // NODO 7.5: CLIENTE INDECISO ENTRE COLORES O PREGUNTA SI PUEDE COMBINAR
    // =========================================================================
    const hasShippingInfo = DataValidatorService.isLikelyShippingData(rawText);

    if (FuzzyMatcherService.isIndecisiveOrCombineTones(rawText) && !hasShippingInfo) {
      this.markGreeted(jid);
      return {
        matched: true,
        intent: 'TONES_INDECISIVE_OR_COMBINE',
        nextState: 'PRICING_SENT',
        response:
          `¡Te entiendo perfectamente! Ambas opciones son preciosas y tienen su encanto 🎄✨\n\n` +
          `✨ *Luz Cálida:* La favorita de nuestros clientes, crea un ambiente navideño súper acogedor, elegante y hogareño.\n` +
          `🌈 *Multicolor:* Festiva, colorida y alegre, resalta muchísimo en fachadas y a los niños les encanta.\n` +
          `💡 *Luz Blanca:* Iluminación nítida, moderna y brillante de gran visibilidad.\n\n` +
          `👉 *¡Y la gran ventaja es que sí las puedes combinar!* En el *Combo Dúo (2 unidades por $79.900)* puedes pedir 1 Cálida y 1 Multicolor, y en el de 3 unidades ($109.900) puedes armar la combinación que más te guste 🙌\n\n` +
          `¿Te gustaría que te preparemos el Combo Dúo de 2 unidades combinadas ($79.900) o prefieres llevar 3? 🎄`,
      };
    }

    // =========================================================================
    // NODO 8: SELECCIÓN DE TONO POR PARTE DEL CLIENTE (¡ROMPE EL BUCLE!)
    // =========================================================================
    // Si el cliente RESPONDE con un tono (ej: "luz calida la mas recomendada", "Calidad", "Blanca", "multicolor", "la primera"):
    const detectedTone = FuzzyMatcherService.detectToneChoice(rawText);

    if (detectedTone && !hasShippingInfo) {
      this.setSelectedTone(jid, detectedTone);
      this.markGreeted(jid);

      // Si ya había seleccionado un combo o ya estaba en DATA_REQUESTED:
      const existingProduct = this.customerProduct.get(jid);
      if (existingProduct) {
        return {
          matched: true,
          intent: 'TONE_SELECTED_CONTINUE_DATA',
          nextState: 'DATA_REQUESTED',
          response:
            `¡Listo, registrado en luz *${detectedTone}*! ✨\n\n` +
            `Para programar el despacho de tu *${existingProduct.description}* con Envío Gratis y pago contra entrega 🚚, por favor compártenos en un solo mensaje:\n` +
            `• Nombre completo:\n` +
            `• Número de teléfono celular:\n` +
            `• Dirección exacta (con barrio y detalles como torre/apto):\n` +
            `• Ciudad y departamento:`,
        };
      }

      // Si aún no ha seleccionado combo, confirmar el tono cálidamente y anclar al Combo Dúo:
      return {
        matched: true,
        intent: 'TONE_CHOSEN_PRESENT_COMBOS',
        nextState: 'PRICING_SENT',
        response:
          `¡Excelente elección! La luz *${detectedTone}* queda espectacular y da ese ambiente navideño soñado 🎄✨\n\n` +
          `Nuestras opciones con Envío Gratis a toda Colombia y Pago Contra Entrega en efectivo son:\n` +
          `${pricingListText}\n\n` +
          `La gran mayoría lleva el *Combo Dúo de 2 unidades por $79.900* (ahorras $30.000 y cubres 20 metros) para que rinda en fachada y balcón 🙌 ¿Deseas que te dejemos apartado el Combo Dúo o prefieres la unidad individual?`,
      };
    }

    // =========================================================================
    // NODO 9: PREGUNTA SOBRE QUÉ TONOS EXISTEN (CONSULTA, NO SELECCIÓN)
    // =========================================================================
    const isAskingAboutTones =
      /\b(que\s*tonos|cuales\s*tonos|tonos\s*disponibles|colores\s*disponibles|que\s*colores|cuales\s*colores|tienen\s*colores|tienen\s*mas\s*colores)\b/i.test(text) ||
      text === 'tonos' || text === 'colores' || text === 'que tonos tienen' || text === 'que tonos de luz tienen disponibles';

    if (isAskingAboutTones) {
      this.markGreeted(jid);
      return {
        matched: true,
        intent: 'LIGHT_TONES_INFO',
        response:
          `Tenemos disponibles los 3 tonos:\n` +
          `✨ *Luz Cálida:* La más recomendada y vendida, crea un ambiente navideño súper acogedor y elegante.\n` +
          `💡 *Luz Blanca:* Iluminación nítida, moderna y brillante de alta visibilidad.\n` +
          `🌈 *Multicolor:* Festiva, alegre y colorida con tonos navideños tradicionales.\n\n` +
          `¿Cuál de los 3 tonos te gusta más para tu hogar?`,
      };
    }

    // =========================================================================
    // NODO 10: PREGUNTA POR PRECIOS O VALOR
    // =========================================================================
    if (hasPriceWord) {
      this.markGreeted(jid);
      const chosenTone = this.getSelectedTone(jid);
      const toneSuffix = chosenTone ? ` (en luz ${chosenTone})` : '';

      return {
        matched: true,
        intent: 'PRICE_LIST',
        nextState: 'PRICING_SENT',
        response:
          `Con mucho gusto te comparto nuestros precios oficiales con Envío Gratis y Pago Contra Entrega en efectivo 🚚:\n\n` +
          `${pricingListText}\n\n` +
          `¡El más pedido para fachadas y balcones es el *Combo Dúo de 2 unidades por $79.900* (ahorras $30.000 y cubres 20 metros)! 🎄 ¿Deseas que te lo dejemos apartado${toneSuffix}?`,
      };
    }

    // =========================================================================
    // NODO 11: INFORMACIÓN GENERAL DEL PRODUCTO
    // =========================================================================
    const infoWords = [
      'informacion', 'mas informacion', 'info', 'asesoria', 'quiero saber', 'interesa',
      'quiero mas informacion', 'me da informacion', 'me regala informacion'
    ];
    const hasInfo = infoWords.some((w) => text.includes(w));

    if (hasInfo) {
      this.markGreeted(jid);
      return {
        matched: true,
        intent: 'PRODUCT_INFO',
        nextState: 'PRICING_SENT',
        response:
          `Nuestra *${product.name}* cuenta con 100 bombillos LED brillantes (10 metros), panel solar de recarga automática (cero gasto en tu factura de luz), sensor que se prende solo al anochecer y certificación impermeable IP65 🌧️💡\n\n` +
          `Disponibles en: *Cálida*, *Blanca* y *Multicolor* 🌈\n\n` +
          `🚚 *Precios con Envío GRATIS y Pago Contra Entrega:*\n` +
          `${pricingListText}\n\n` +
          `¿Cuál de los 3 tonos te gusta más? ¿O te dejamos apartado el Combo Dúo de 2 unidades por $79.900? ⭐`,
      };
    }

    // =========================================================================
    // NODO 12: SALUDOS (PRIMER MENSAJE VS CHAT ACTIVO)
    // =========================================================================
    const greetingWords = [
      'hola', 'buenas', 'buen dia', 'buenos dias', 'buenas tardes', 'buenas noches', 'hola?', 'muy buenas tardes', 'muy buenas tarde'
    ];
    const isGreeting = greetingWords.some((w) => text === w || (text.startsWith(w) && text.length <= w.length + 3));

    if (isGreeting) {
      if (this.hasBeenGreeted(jid) || currentState !== 'NEW') {
        return {
          matched: true,
          intent: 'GREETING_ACTIVE',
          response: `¡Hola! Por aquí continúo a tu orden 😊 ¿Deseas que coordinemos tu entrega o te quedó alguna inquietud sobre las luces solares?`,
        };
      }

      this.markGreeted(jid);
      return {
        matched: true,
        intent: 'GREETING_NEW',
        nextState: 'PRICING_SENT',
        mediaPath: productMedia,
        response:
          `¡Hola! Soy Maria Paula de MoraMerco 😊 Con mucho gusto te atiendo sobre nuestra *${product.name}* 🎄✨\n\n` +
          `Cuenta con panel solar recargable (cero consumo de luz), sensor automático al anochecer y resistencia total a lluvias IP65 🌧️💡\n\n` +
          `Disponibles en 3 tonos: ✨ *Cálida*, 💡 *Blanca* y 🌈 *Multicolor*.\n\n` +
          `🚚 *Envío GRATIS a toda Colombia y Pago Contra Entrega en efectivo:*\n` +
          `${pricingListText}\n\n` +
          `¿Cuál de los 3 tonos te gustaría para tu hogar? ¿O prefieres aprovechar el Combo Dúo de 2 unidades ($79.900)? 🎄`,
      };
    }

    // =========================================================================
    // NODO 13: PREGUNTAS FRECUENTES ESPECÍFICAS (FAQ)
    // =========================================================================

    // A. Resistencia a lluvias / clima / IP65
    if (/\b(llueve|lluvia|lluvias|nublado|impermeable|resiste\s*agua|intemperie|se\s*moja|ip65)\b/i.test(text)) {
      return {
        matched: true,
        intent: 'WEATHER_RESISTANCE',
        response:
          `¡Totalmente resistentes! Cuentan con certificación IP65 impermeable para intemperie, soportando lluvias y sol intenso sin dañarse 🌧️☀️\n\n` +
          `Además, el panel cuenta con batería interna de litio que almacena energía incluso en días nublados para encenderse normal durante la noche ✨\n\n` +
          `¿Te gustaría en luz *Cálida*, *Blanca* o *Multicolor*?`,
      };
    }

    // B. Cómo funciona / Sensor / Cero consumo
    if (/\b(como\s*funciona|se\s*prende\s*sola|sensor|como\s*carga|cuanto\s*dura\s*la\s*bateria|panel\s*solar|consume\s*luz|recargable)\b/i.test(text)) {
      return {
        matched: true,
        intent: 'HOW_IT_WORKS',
        response:
          `Cero consumo de electricidad ⚡ Su panel solar recarga la batería interna durante el día con la luz del sol, y su sensor inteligente las enciende automáticamente al caer la noche y las apaga al amanecer ✨\n\n` +
          `¿Prefieres en tono *Cálida*, *Blanca* o *Multicolor*?`,
      };
    }

    // C. Medidas y longitud
    if (/\b(cuanto\s*mide|medidas|longitud|largo|metros|cuantos\s*bombillos|cuantos\s*leds)\b/i.test(text)) {
      return {
        matched: true,
        intent: 'MEASUREMENTS',
        response:
          `Cada extensión tiene 10 metros de longitud y 100 bombillos LED de alta luminosidad ✨ Con el Combo Dúo de 2 unidades te llevas 20 metros y 200 bombillos con un ahorro de $30.000 🎄\n\n` +
          `¿Para qué espacio las planeas colocar? ¿Fachada, jardín, árbol o balcón?`,
      };
    }

    // D. Medios de pago
    if (/\b(medios\s*de\s*pago|formas\s*de\s*pago|como\s*se\s*paga|nequi|bancolombia|daviplata|transferencia|tarjeta|efectivo|contraentrega)\b/i.test(text)) {
      return {
        matched: true,
        intent: 'PAYMENT_METHODS',
        response:
          `El pago es 100% contra entrega en efectivo al recibir su paquete en su domicilio o en oficina de Interrapidísimo 💵 (Muchos repartidores también permiten transferencia Nequi/Bancolombia al momento de la entrega) 👍\n\n` +
          `¿Deseas 1 Unidad ($54.900) o aprovechar el Combo Dúo de 2 Unidades ($79.900)?`,
      };
    }

    // E. Garantía y seguridad
    if (/\b(garantia|es\s*seguro|confiable|estafa|como\s*se\s*que\s*llega|testimonios|abrir\s*antes|revisar\s*antes)\b/i.test(text)) {
      return {
        matched: true,
        intent: 'WARRANTY_TRUST',
        response:
          `Total tranquilidad: abonas el valor en efectivo solo al recibir el producto en tus manos con la transportadora y cuentas con garantía directa de 30 días de fábrica 🙌\n\n` +
          `¿En qué ciudad o municipio te encuentras para tu entrega?`,
      };
    }

    // F. Tiempo de entrega y envío
    if (/\b(cuanto\s*demora|cuanto\s*tarda|tiempo\s*de\s*entrega|cuando\s*llega|cuantos\s*dias|costo\s*del\s*envio|el\s*envio\s*es\s*gratis)\b/i.test(text)) {
      return {
        matched: true,
        intent: 'SHIPPING_TIME',
        response:
          `El envío es *100% GRATIS* a toda Colombia y pagas al recibir 🙌 Tarda de 2 a 4 días hábiles mediante Interrapidísimo o Coordinadora 📦\n\n` +
          `¿En qué ciudad o municipio te encuentras?`,
      };
    }

    // G. Reclamo en oficina
    if (/\b(oficina\s*interrapidisimo|reclamo\s*en\s*oficina|recoger\s*en\s*oficina|oficina\s*transportadora)\b/i.test(text)) {
      return {
        matched: true,
        intent: 'OFFICE_DELIVERY',
        response:
          `¡Claro que sí! Puedes solicitar despacho para *Reclamo en Oficina de Interrapidísimo* en tu municipio. El envío sigue siendo 100% GRATIS y cancelas en efectivo en la misma oficina al retirar 🏢📦\n\n` +
          `¿En qué municipio o departamento deseas reclamar?`,
      };
    }

    // H. Desistimiento o "lo voy a pensar"
    if (/\b(no\s*gracias|muy\s*caro|pensar|pensarlo|voy\s*a\s*pensarlo|ya\s*no\s*quiero|luego\s*aviso)\b/i.test(text)) {
      return {
        matched: true,
        intent: 'DECLINED',
        response:
          `Comprendemos totalmente 😊 Si más adelante deseas coordinar tu entrega o resolver cualquier duda sobre las luces solares, con el mayor gusto quedamos a tu entera disposición. ¡Que tengas un excelente día! ✨`,
      };
    }

    // I. Agradecimientos
    if (/\b(gracias|muchas\s*gracias|mil\s*gracias|muy\s*amable)\b/i.test(text)) {
      return {
        matched: true,
        intent: 'THANKS',
        response: `¡Con el mayor gusto! Es un placer atenderte 😊 Quedo a tu disposición por si deseas apartar tus luces.`,
      };
    }

    // Si no es un caso contemplado localmente, delegar a Gemini AI
    return { matched: false };
  }
}
