import path from 'path';
import fs from 'fs';
import { IButtonOption } from './message-handler.interface.js';
import { DataValidatorService, CustomerShippingData } from './data-validator.service.js';
import { FuzzyMatcherService } from './fuzzy-matcher.service.js';

export type ChatState = 'NEW' | 'AWAITING_APPLIANCE' | 'PRICING_SENT' | 'DATA_REQUESTED' | 'CONFIRMATION_PENDING' | 'ORDER_CONFIRMED';

export interface QuickReplyResult {
  matched: boolean;
  intent?: string;
  response?: string;
  buttons?: IButtonOption[];
  nextState?: ChatState;
  mediaPath?: string;
}

export interface CustomerProductSelection {
  description: string;
  price: number;
}

export class QuickReplyService {
  private readonly chatStates = new Map<string, ChatState>();
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

  public getState(jid: string): ChatState {
    return this.chatStates.get(jid) || 'NEW';
  }

  public setState(jid: string, state: ChatState): void {
    this.chatStates.set(jid, state);
    if (state !== 'NEW') {
      this.greetedJids.add(jid);
    }
  }

  public hasBeenGreeted(jid: string): boolean {
    return this.greetedJids.has(jid) || (this.chatStates.has(jid) && this.chatStates.get(jid) !== 'NEW');
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
   * Evalúa el mensaje con memoria de estado y acumulación de datos para dar respuestas
   * ultra rápidas, humanas, concisas y con soporte para entregas en oficina de Interrapidísimo
   */
  public matchQuickReply(rawText: string, jid: string): QuickReplyResult {
    const text = this.normalizeText(rawText);
    const currentState = this.getState(jid);

    // Ruta de la imagen del producto (prioriza fotobase.jpg o base_producto.jpg)
    const primaryImg = path.resolve(process.cwd(), 'assets/fotobase.jpg');
    const fallbackImg = path.resolve(process.cwd(), 'assets/base_producto.jpg');
    const productMedia = fs.existsSync(primaryImg) ? primaryImg : (fs.existsSync(fallbackImg) ? fallbackImg : undefined);

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
      this.customerProduct.set(jid, { description: 'Combo Dúo (x2 Pares - Nevera + Lavadora) ($119.900)', price: 119900 });
      return {
        matched: true,
        intent: 'SELECT_KIT2_WITH_PHOTO',
        nextState: 'DATA_REQUESTED',
        mediaPath: productMedia,
        response:
          `¡Excelente elección con el *Combo Dúo x2*! 🎉 ($119.900 con Envío Gratis y pago en casa).\n\n` +
          `Aquí le comparto la foto 📸✨ Son dos barras telescópicas independientes en acero reforzado con 24 ruedas y frenos (2 pares completos para sus dos equipos). Elevan 4 cm para trapear sabroso sin matarse la espalda.\n\n` +
          `Por favor facilítenos sus datos para despacharle hoy:\n` +
          `• Nombre y apellido:\n` +
          `• Ciudad/Municipio y Departamento:\n` +
          `• Dirección (o si prefiere oficina Interrapidísimo):\n` +
          `• Número de celular:`,
      };
    }

    if (isPhotoRequest) {
      // Si ya está en recolección de datos, NO reiniciar con saludo ni precios
      if (currentState === 'DATA_REQUESTED' || currentState === 'CONFIRMATION_PENDING') {
        const saved = this.customerData.get(jid);
        const namePart = saved?.name ? `, ${saved.name.split(' ')[0]}` : '';
        const destPart = saved?.city ? ` en ${saved.city}` : '';
        return {
          matched: true,
          intent: 'SEND_PHOTO_DATA_PENDING',
          mediaPath: productMedia,
          response:
            `Con mucho gusto${namePart}, aquí le comparto la foto 📸✨\n\n` +
            `Es nuestra *Base Ajustable de Acero Independiente*: un par de barras telescópicas con 24 ruedas y frenos integrados. Elevan 4 cm para trapear fácil sin matarse la espalda y evitar el óxido.\n\n` +
            `Continuamos atentos a sus datos de entrega${destPart} para programarle el despacho hoy 🚚📦`,
        };
      }

      // Si la conversación ya está activa o ya se saludó, NUNCA volver a presentarse
      if (this.hasBeenGreeted(jid) || currentState !== 'NEW') {
        return {
          matched: true,
          intent: 'SEND_PHOTO_ACTIVE',
          mediaPath: productMedia,
          response:
            `Con mucho gusto le comparto la foto 📸✨\n\n` +
            `Son dos barras de acero independientes y telescópicas con 24 ruedas y frenos integrados. Elevan 4 cm para trapear sabroso sin matarse la espalda y protegen sus equipos del óxido.\n\n` +
            `¿Desea ordenar el Combo x1 ($69.900) o aprovechar el Combo Dúo x2 en oferta ($119.900)?`,
        };
      }

      // Solo si es absolutamente el primer contacto (NEW)
      this.markGreeted(jid);
      return {
        matched: true,
        intent: 'SEND_PHOTO_NEW',
        nextState: 'PRICING_SENT',
        mediaPath: productMedia,
        response:
          `¡Hola! Soy Maria Paula de MoraMerco 😊 Pille pues, aquí le comparto la foto 📸✨\n\n` +
          `Es nuestra *Base Ajustable de Acero Independiente*: un par de barras telescópicas con 24 ruedas y freno integrado (soportan electrodomésticos pesados y elevan 4 cm para trapear fácil sin matarse la espalda) 🛠️✨\n\n` +
          `🚚 *Envío GRATIS y pago contra entrega en efectivo:*\n` +
          `🔹 Combo x1 (1 Par): $69.900\n` +
          `🔥 Combo Dúo (x2 Pares - Nevera + Lavadora): $119.900 (Ahorra $20.000)\n` +
          `✨ Combo Hogar Pack (x3 Pares): $159.900 (Ahorra $50.000)\n\n` +
          `¡Oferta de lanzamiento con pocas unidades! ⏳ ¿Las busca para 1 electrodoméstico o desea aprovechar el Combo Dúo?`,
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
          const product = this.customerProduct.get(jid)?.description || 'Combo x1 (1 Par de Barras) ($69.900)';
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
              `• Pedido: ${product}\n` +
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

      // Si el cliente en etapa de datos NO envió datos de despacho, sino una duda o cambio:

      // A. Cambio de producto a Combo Dúo x2
      const wantsKit2Change =
        /\b(mejor|quiero|cambiame|mande?me|deme)\b.*(combo|kit|dos|ambas|ambos|duo|promo)/i.test(text) ||
        /\b(las dos|las 2|el de dos|el kit x2|kit x2|combo duo|el combo)\b/i.test(text);

      if (wantsKit2Change) {
        this.customerProduct.set(jid, { description: 'Combo Dúo (x2 Pares - Nevera + Lavadora) ($119.900)', price: 119900 });
        return {
          matched: true,
          intent: 'SWITCH_TO_KIT2',
          nextState: 'DATA_REQUESTED',
          response:
            `¡Excelente elección! Le dejamos registrado el *Combo Dúo x2 (Nevera + Lavadora)* por *$119.900* con Envío Gratis y pago contra entrega (Ahorra $20.000) 🚚🎉\n\n` +
            `Por favor facilítenos sus datos para dejarle programado el despacho hoy:\n` +
            `• Nombre y apellido:\n` +
            `• Ciudad/Municipio y Departamento:\n` +
            `• Dirección (o si prefiere oficina Interrapidísimo):\n` +
            `• Número de celular:`,
        };
      }

      // B. Cambio de producto a Combo x1 (1 Par de Barras)
      const wantsSingleChange =
        /\b(mejor|quiero|cambiame|mande?me|deme)\b.*(solo\s*un\s*par|1\s*par|un\s*par|solo\s*una|una\s*sola|solo\s*nevera|solo\s*lavadora)/i.test(text) ||
        text === 'solo una' || text === 'una sola' || text === 'un par' || text === '1 par' || text === 'una';

      if (wantsSingleChange) {
        let desc = 'Combo x1 (1 Par de Barras) ($69.900)';
        if (text.includes('nevera')) desc = '1 Par de Barras para Nevera ($69.900)';
        else if (text.includes('lavadora')) desc = '1 Par de Barras para Lavadora ($69.900)';
        this.customerProduct.set(jid, { description: desc, price: 69900 });
        return {
          matched: true,
          intent: 'SWITCH_TO_SINGLE',
          nextState: 'DATA_REQUESTED',
          response:
            `Con mucho gusto. Le dejamos registrado el *Combo x1 (1 Par de Barras) ($69.900)* con Envío Gratis y pago contra entrega 🚚📦\n\n` +
            `Por favor facilítenos sus datos para programarle el despacho hoy:\n` +
            `• Nombre y apellido:\n` +
            `• Ciudad/Municipio y Departamento:\n` +
            `• Dirección (o si prefiere oficina Interrapidísimo):\n` +
            `• Número de celular:`,
        };
      }

      // C. Inquietud sobre el precio del combo o de las 2 barras ("i el x q cuesta", "cuanto valen las 2 vaces", etc.)
      const isKitPriceQuery =
        /\b(el\s*x|el\s*x2|x2|las\s*2|las\s*dos|kit\s*x?2?|combo\s*x?2?|combo|duo)\b.*(cuesta|costo|vale|precio|valor)/i.test(text) ||
        /\b(cuanto|que)\b.*(cuesta|costo|vale|precio|valor).*(el\s*x|el\s*x2|las\s*2|las\s*dos|kit|combo|duo|barras|bases|vaces)/i.test(text) ||
        text.includes('el x q cuesta') || text.includes('el x que cuesta') || text.includes('el x q costo') ||
        text.includes('las 2 vaces') || text.includes('las dos bases') || text.includes('cuanto valen las 2') ||
        text.includes('trae las dos bases') || text.includes('es cada una') || text.includes('cuanto vale el combo');

      if (isKitPriceQuery) {
        return {
          matched: true,
          intent: 'KIT2_PRICE_INQUIRY',
          nextState: 'DATA_REQUESTED',
          response:
            `Con mucho gusto le confirmo: el *Combo Dúo x2* (los dos pares de barras para nevera y lavadora) le sale en *$119.900* con Envío Gratis a toda Colombia y pago en efectivo al recibir (ahorra $20.000) 🚚✨\n\n` +
            `¿Desea que le dejemos programado el Combo Dúo x2?`,
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
            `Comprendemos totalmente 😊 Si más adelante desea coordinar su pedido o resolver cualquier duda sobre las bases, con el mayor gusto estaremos para servirle. ¡Que tenga un excelente día!`,
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

    // A. DUDA ESPECÍFICA: "nevera y lavadora de 40 kilos la base si le sirve" / centrifugado
    const mentionsNevera = text.includes('nevera');
    const mentionsLavadora = text.includes('lavadora');
    const mentionsBothAppliances =
      (mentionsNevera && mentionsLavadora) ||
      /\b(ambas|ambos|las dos|las 2|los dos|los 2|nevera i lavadora|nevera y lavadora|lavadora y nevera)\b/i.test(text);

    const phonText = FuzzyMatcherService.toPhonetic(rawText);
    const hasWasherWeightDoubt =
      (/\b(40\s*kilos?|40k|kilos?|kg|peso|aguanta|soporta|resiste|centrifugad[oa]|vibra|vibracion|se mueve|se corre|frenos?)\b/i.test(text) ||
       phonText.includes('centrifujado') || phonText.includes('sentrifugado') || phonText.includes('kilos')) &&
      (/\b(si le sirve|le sirve|sirve ala|sirve para|sirve|cirve|sirbe)\b/i.test(text) ||
       phonText.includes('sirbe') || phonText.includes('cirve'));

    if (hasWasherWeightDoubt) {
      if (mentionsBothAppliances) {
        return {
          matched: true,
          intent: 'WASHER_40KG_AND_BOTH',
          nextState: 'PRICING_SENT',
          response:
            `Con mucho gusto le confirmo: le sirve perfectamente para su lavadora de 40 kilos y para su nevera. Son barras de acero macizo con 24 ruedas y frenos de seguridad integrados, por lo que quedan totalmente firmes y no se mueven al centrifugar ✨\n\n` +
            `Para sus dos electrodomésticos le recomendamos el *Combo Dúo x2 por $119.900* (ahorra $20.000) con Envío Gratis y pago contra entrega en efectivo 🚚\n\n` +
            `¿Desea que le dejemos programado el Combo Dúo x2?`,
        };
      } else {
        return {
          matched: true,
          intent: 'WASHER_WEIGHT_DOUBT',
          nextState: 'PRICING_SENT',
          response:
            `Con mucho gusto le confirmo: le sirve perfectamente a su lavadora. Nuestras barras de acero tienen 24 ruedas con freno integrado y almohadillas antideslizantes que quedan firmes y absorben la vibración del centrifugado ✨\n\n` +
            `🔹 Combo x1 (1 Par): $69.900 | 🔥 Combo Dúo (x2 Pares): $119.900 (Envío Gratis y pago en casa 🚚)\n\n` +
            `¿Las busca solo para lavadora o desea aprovechar la promoción del Combo Dúo?`,
        };
      }
    }

    // B. CONSULTA DE PRECIO DE KIT X2 / "i el x q cuesta" / "cuanto valen las 2 vaces"
    const isKit2PriceInquiry =
      /\b(el\s*x|el\s*x2|x2|las\s*2|las\s*dos|kit\s*x?2?|combo\s*x?2?|combo|duo)\b.*(cuesta|costo|vale|precio|valor)/i.test(text) ||
      /\b(cuanto|que)\b.*(cuesta|costo|vale|precio|valor).*(el\s*x|el\s*x2|las\s*2|las\s*dos|kit|combo|duo|barras|bases|vaces)/i.test(text) ||
      text.includes('el x q cuesta') || text.includes('el x que cuesta') || text.includes('el x q costo') ||
      text.includes('las 2 vaces') || text.includes('las dos bases') || text.includes('cuanto valen las 2') ||
      text.includes('trae las dos bases') || text.includes('es cada una') || text.includes('cuanto vale el combo');

    if (isKit2PriceInquiry) {
      return {
        matched: true,
        intent: 'PRICE_KIT2_EXPLICIT',
        nextState: 'PRICING_SENT',
        response:
          `Con mucho gusto le confirmo: el *Combo Dúo x2* (los dos pares de barras para nevera y lavadora) tiene un valor de *$119.900* con Envío Gratis a toda Colombia y pago en efectivo al recibir (ahorra $20.000) 🚚✨\n\n` +
          `¿Desea que le dejemos programado el Combo Dúo x2?`,
      };
    }

    // C. SELECCIÓN DE COMPRA DIRECTA (EL CLIENTE DICE QUÉ DESEA LLEVAR)
    // Validar rigurosamente que NO sea una pregunta ni una duda
    const isQuestionOrDoubt = FuzzyMatcherService.hasQuestionOrDoubt(rawText);

    if (!isQuestionOrDoubt) {
      // 1. Deseo de comprar Combo Hogar Pack x3
      const wantsKit3 =
        /\b(combo\s*x?\s*3|kit\s*x?\s*3|las\s*3|las\s*tres|los\s*3|los\s*tres|3\s*pares|tres\s*pares|159900|159\.900)\b/i.test(text) ||
        text === '3' || text === 'tres';

      if (wantsKit3) {
        this.customerProduct.set(jid, { description: 'Combo Hogar Pack (x3 Pares de Barras) ($159.900)', price: 159900 });
        return {
          matched: true,
          intent: 'SELECT_KIT3',
          nextState: 'DATA_REQUESTED',
          response:
            `Excelente elección con el *Combo Hogar Pack x3* 🎉 ($159.900 con Envío Gratis y pago contra entrega en efectivo - Ahorra $50.000).\n\n` +
            `Por favor facilítenos sus datos para el despacho:\n` +
            `• Nombre y apellido:\n` +
            `• Ciudad/Municipio y Departamento:\n` +
            `• Dirección (o si prefiere oficina Interrapidísimo):\n` +
            `• Número de celular:`,
        };
      }

      // 2. Deseo de comprar Combo Dúo x2 (Nevera + Lavadora)
      const wantsKit2 =
        /\b(quiero|mandame|aparta|deseo|llevar|pedir|comprar|favor)\b.*(combo\s*x?2?|kit|las\s*dos|las\s*2|ambas|ambos|dos\s*pares|2\s*pares|duo|promo)/i.test(text) ||
        /\b(para\s*ambas|para\s*las\s*dos|para\s*nevera\s*y\s*lavadora|para\s*nevera\s*i\s*lavadora)\b/i.test(text) ||
        /\b(el\s*kit|el\s*kit\s*x2|kit\s*x2|el\s*combo|el\s*combo\s*duo|combo\s*duo|dos\s*pares|2\s*pares|119900|119\.900)\b/i.test(text) ||
        ((text === '2' || text === 'dos' || text === 'las dos' || text === 'las 2' || text === 'ambas') && currentState === 'PRICING_SENT');

      if (wantsKit2) {
        this.customerProduct.set(jid, { description: 'Combo Dúo (x2 Pares - Nevera + Lavadora) ($119.900)', price: 119900 });
        return {
          matched: true,
          intent: 'SELECT_KIT2',
          nextState: 'DATA_REQUESTED',
          response:
            `Excelente elección con el *Combo Dúo x2* 🎉 ($119.900 con Envío Gratis y pago contra entrega en efectivo - Ahorra $20.000).\n\n` +
            `Por favor facilítenos sus datos para el despacho:\n` +
            `• Nombre y apellido:\n` +
            `• Ciudad/Municipio y Departamento:\n` +
            `• Dirección (o si prefiere oficina Interrapidísimo):\n` +
            `• Número de celular:`,
        };
      }

      // 3. Deseo de comprar Combo x1 (1 Par de Barras) ($69.900)
      // Debe ser para 1 solo electrodoméstico (NUNCA si menciona ambos)
      const wantsSingle =
        !mentionsBothAppliances &&
        (/\b(quiero|mandame|aparta|deseo|llevar|pedir|comprar)\b.*(un\s*par|1\s*par|una|1|sola|solo|primera|opcion\s*1)/i.test(text) ||
         /\b(solo\s*un\s*par|1\s*par|un\s*par|solo\s*una|una\s*sola|solo\s*nevera|la\s*de\s*nevera|solo\s*lavadora|la\s*de\s*lavadora|69900|69\.900)\b/i.test(text) ||
         ((text === '1' || text === 'una' || text === 'el uno' || text === 'la primera') && currentState === 'PRICING_SENT'));

      if (wantsSingle) {
        let productDesc = 'Combo x1 (1 Par de Barras) ($69.900)';
        if (text.includes('nevera')) productDesc = '1 Par de Barras para Nevera ($69.900)';
        else if (text.includes('lavadora')) productDesc = '1 Par de Barras para Lavadora ($69.900)';
        this.customerProduct.set(jid, { description: productDesc, price: 69900 });

        return {
          matched: true,
          intent: 'SELECT_SINGLE',
          nextState: 'DATA_REQUESTED',
          response:
            `Con mucho gusto. Se lo programamos hoy mismo por *$69.900* con Envío Gratis y pago contra entrega 📦🚚\n\n` +
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
          this.customerProduct.set(jid, { description: 'Combo x1 (1 Par de Barras) ($69.900)', price: 69900 });
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
            `Con gusto le confirmo: el Combo x1 (1 Par de Barras) le sale en *$69.900* o el Combo Dúo x2 (Nevera + Lavadora) en *$119.900* (Envío Gratis y pago contra entrega en efectivo) 🚚\n\n` +
            `¿Desea 1 Par o prefiere aprovechar el Combo Dúo x2?`,
        };
      }
      if (hasInfo) {
        return {
          matched: true,
          intent: 'INFO_REMINDER',
          response:
            `Nuestra Base Ajustable de Acero consta de dos barras telescópicas independientes con 24 ruedas y freno integrado 🛠️✨ Elevan 4 cm para trapear sabroso sin matarse la espalda.\n\n` +
            `Combo x1: $69.900 | Combo Dúo x2: $119.900 (Envío Gratis y pago en casa 🚚)\n\n` +
            `¿Cuál de las opciones le apartamos?`,
        };
      }
      if (isGreeting) {
        return {
          matched: true,
          intent: 'GREETING_ACTIVE',
          response: `Por aquí continúo a su orden 😊 ¿Desea que coordinemos su entrega o tiene alguna inquietud?`,
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
        response:
          `¡Hola! Soy Maria Paula de MoraMerco 😊 Pille pues:\n\n` +
          `Nuestra *Base Ajustable de Acero Independiente* consta de un par de barras telescópicas con 24 ruedas y freno integrado (soportan electrodomésticos pesados y elevan 4 cm para trapear fácil sin matarse la espalda) 🛠️✨\n\n` +
          `🚚 *Envío GRATIS y Pago Contra Entrega en efectivo:*\n` +
          `🔹 Combo x1 (1 Par): $69.900\n` +
          `🔥 Combo Dúo (x2 Pares - Nevera + Lavadora): $119.900 (Ahorra $20.000)\n` +
          `✨ Combo Hogar Pack (x3 Pares): $159.900 (Ahorra $50.000)\n\n` +
          `¡Oferta de lanzamiento con pocas unidades! ⏳ ¿Las busca para nevera, lavadora o desea el Combo Dúo?`,
      };
    }

    if (hasPrice) {
      return {
        matched: true,
        intent: 'PRICE',
        nextState: 'PRICING_SENT',
        response:
          `¡Hola! Soy Maria Paula de MoraMerco 😊\n\n` +
          `🚚 *Envío GRATIS y Pago Contra Entrega en efectivo:*\n` +
          `🔹 Combo x1 (1 Par de Barras): $69.900\n` +
          `🔥 Combo Dúo (x2 Pares - Nevera + Lavadora): $119.900 (Ahorra $20.000)\n` +
          `✨ Combo Hogar Pack (x3 Pares): $159.900 (Ahorra $50.000)\n\n` +
          `¡Oferta de lanzamiento con pocas unidades! ⏳ ¿Las busca para 1 electrodoméstico o prefiere el Combo Dúo?`,
      };
    }

    if (isGreeting) {
      return {
        matched: true,
        intent: 'GREETING',
        nextState: 'AWAITING_APPLIANCE',
        response:
          `¡Hola! Soy Maria Paula de MoraMerco 😊\n\n` +
          `¿Las barras móviles las busca para su nevera, lavadora o para ambos equipos?`,
      };
    }

    // =========================================================================
    // 5. EL CLIENTE SOLO INDICA QUÉ ELECTRODOMÉSTICO TIENE (SIN DECIDIR COMPRA AÚN)
    // =========================================================================
    const isMentioningFridge = ['nevera', 'para nevera', 'la nevera', 'solo nevera'].some(
      (w) => text === w || (text.includes(w) && !text.includes('lavadora') && text.split(' ').length <= 6)
    );
    const isMentioningWasher = ['lavadora', 'para lavadora', 'la lavadora', 'solo lavadora'].some(
      (w) => text === w || (text.includes(w) && !text.includes('nevera') && text.split(' ').length <= 6)
    );
    const isMentioningBoth = ['ambas', 'las dos', 'los dos', 'las 2', 'para ambas', 'para las dos', 'nevera y lavadora', 'lavadora y nevera', 'kit x2', 'combo duo'].some(
      (w) => text === w || (text.includes(w) && text.split(' ').length <= 7)
    );

    if (currentState === 'AWAITING_APPLIANCE' || currentState === 'NEW') {
      if (isMentioningFridge) {
        return {
          matched: true,
          intent: 'OFFER_FRIDGE',
          nextState: 'PRICING_SENT',
          response:
            `Con mucho gusto. Para su nevera le quedan a la medida: son dos barras telescópicas con 24 ruedas y frenos (elevan 4 cm para trapear fácil sin matarse la espalda y evitar el óxido) ✨\n\n` +
            `🔹 *Combo x1 (1 Par):* $69.900\n` +
            `🔥 *Combo Dúo (Nevera + Lavadora):* $119.900 (Ahorra $20.000)\n\n` +
            `¿Desea solo para nevera o prefiere la promoción del Combo Dúo?`,
        };
      }

      if (isMentioningWasher) {
        return {
          matched: true,
          intent: 'OFFER_WASHER',
          nextState: 'PRICING_SENT',
          response:
            `Con mucho gusto. Para su lavadora le quedan a la medida: barras de acero telescópicas con 24 ruedas y freno integrado (quedan firmes al centrifugar y elevan 4 cm para trapear fácil) ✨\n\n` +
            `🔹 *Combo x1 (1 Par):* $69.900\n` +
            `🔥 *Combo Dúo (Nevera + Lavadora):* $119.900 (Ahorra $20.000)\n\n` +
            `¿Desea solo para lavadora o prefiere la promoción del Combo Dúo?`,
        };
      }

      if (isMentioningBoth) {
        return {
          matched: true,
          intent: 'OFFER_BOTH',
          nextState: 'PRICING_SENT',
          response:
            `Excelente decisión. El *Combo Dúo x2* (2 pares de barras para nevera y lavadora) le sale en *$119.900* con Envío Gratis y pago contra entrega en efectivo (ahorra $20.000) ✨\n\n` +
            `¿Desea que se lo dejemos programado para despacho hoy mismo?`,
        };
      }
    }

    // =========================================================================
    // 6. PREGUNTAS FRECUENTES (BREVES, CÁLIDAS Y AL GRANO)
    // =========================================================================
    if (currentState === 'ORDER_CONFIRMED') {
      return { matched: false };
    }

    // A. CENTRIFUGADO, VIBRACIÓN Y FRENOS
    const centrifugadoWords = [
      'centrifugado', 'centrifugar', 'vibra', 'vibracion', 'se mueve', 'se corre',
      'tiembla', 'frena', 'frenos', 'no se mueve', 'queda fija'
    ];
    if (centrifugadoWords.some((w) => text.includes(w))) {
      return {
        matched: true,
        intent: 'CENTRIFUGADO_VIBRACION',
        response:
          `Nuestras barras cuentan con 24 ruedas con freno integrado y almohadillas antideslizantes. Al activar los frenos, la lavadora queda totalmente firme al piso y absorbe las vibraciones del centrifugado ✨\n\n` +
          `🔹 Combo x1 (1 Par): $69.900 | 🔥 Combo Dúo x2 (2 Pares): $119.900 (Envío Gratis y pago contra entrega 🚚)\n\n` +
          `¿Desea 1 Par o aprovechar la oferta del Combo Dúo x2?`,
      };
    }

    // B. PESO, RESISTENCIA Y CAPACIDAD
    const weightWords = [
      'cuanto peso soporta', 'cuanto peso aguanta', 'peso maximo', 'soporta', 'aguanta',
      'kilos', 'kg', '40 kilos', 'congelador', 'peso resiste', 'aguanta el centrifugado'
    ];
    if (weightWords.some((w) => text.includes(w))) {
      return {
        matched: true,
        intent: 'WEIGHT_CAPACITY',
        response:
          `Soportan con total tranquilidad electrodomésticos pesados gracias a su estructura en acero macizo y la distribución de carga en sus 24 ruedas. Le sirven perfectamente para lavadoras de cualquier capacidad, neveras grandes y congeladores 🛠️✨\n\n` +
          `🔹 Combo x1: $69.900 | 🔥 Combo Dúo x2: $119.900 (Envío Gratis y pago en casa 🚚)\n\n` +
          `¿Las busca para 1 equipo o prefiere la promoción del Combo Dúo?`,
      };
    }

    // C. ¿ESO SÍ SIRVE? / FUNCIONA / RESISTENCIA GENERAL
    const doesItWorkWords = [
      'eso si sirve', 'si sirve', 'sirve', 'funciona', 'que tal es', 'sale buena',
      'es buena', 'si aguanta', 'vale la pena', 'que tan buena es'
    ];
    if (doesItWorkWords.some((w) => text.includes(w))) {
      return {
        matched: true,
        intent: 'DOES_IT_WORK',
        response:
          `Totalmente garantizado. Son barras de acero telescópicas con 24 ruedas y freno para mover su equipo como una pluma sin esfuerzo ni dolores de espalda, y elevan 4 cm para trapear sabroso 😊\n\n` +
          `Combo x1: $69.900 | Combo Dúo x2: $119.900 (Envío Gratis y pago contra entrega 🚚)\n\n` +
          `¿Desea ordenar 1 Par o la oferta del Combo Dúo x2?`,
      };
    }

    // D. MATERIAL Y RESISTENCIA
    const materialWords = [
      'material', 'de que esta hecho', 'de que material', 'se oxida', 'acero', 'plastico',
      'es resistente'
    ];
    if (materialWords.some((w) => text.includes(w))) {
      return {
        matched: true,
        intent: 'MATERIAL_AND_RESISTANCE',
        response:
          `Es de excelente calidad: dos barras de acero reforzado resistente a la corrosión, almohadillas negras antideslizantes y 24 ruedas con freno de seguridad ✨\n\n` +
          `Combo x1: $69.900 | Combo Dúo x2: $119.900 (Envío Gratis y pago en casa 🚚)\n\n` +
          `¿Para cuántos equipos las necesita?`,
      };
    }

    // E. GARANTÍA Y CONFIANZA (ANTI-ESTAFA)
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

    // F. MEDIOS DE PAGO
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
          `¿Desea el Combo x1 ($69.900) o el Combo Dúo x2 en promoción ($119.900)?`,
      };
    }

    // G. INSTALACIÓN Y ARMADO
    const installWords = [
      'como se instala', 'como se arma', 'armado', 'instalacion', 'dificil de armar',
      'viene armada', 'herramientas', 'facil de armar'
    ];
    if (installWords.some((w) => text.includes(w))) {
      return {
        matched: true,
        intent: 'INSTALLATION',
        response:
          `¡Cero complicaciones y sin herramientas! 🛠️✨ Al ser dos barras de acero independientes (no una plataforma cuadrada que toque atornillar), solo desliza una a cada lado bajo su equipo, ajusta el largo telescópico y baja los frenos. ¡Listo en un dos por tres!\n\n` +
          `¿Las busca para nevera, lavadora o para ambas?`,
      };
    }

    // H. UBICACIÓN Y BODEGAS
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

    // I. ASESOR HUMANO
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

    // J. MEDIDAS Y ALTURA
    const measurementWords = [
      'medidas', 'cuanto mide', 'tamano', 'dimensiones', 'que medidas tiene', 'cuales son las medidas',
      'altura', 'alto', 'del piso', 'del suelo'
    ];
    if (measurementWords.some((w) => text.includes(w))) {
      return {
        matched: true,
        intent: 'MEASUREMENTS',
        nextState: 'PRICING_SENT',
        response:
          `Son dos barras de acero independientes y telescópicas, ajustables desde 45 cm hasta 70 cm de largo. Elevan su equipo exactamente 4 cm del suelo, lo ideal para trapear debajo sin matarse la espalda y evitar que el agua estancada oxide la lámina ✨\n\n` +
          `Combo x1: $69.900 | Combo Dúo x2: $119.900 con Envío Gratis y pago en casa 🚚\n\n` +
          `¿Cuántos pares necesita?`,
      };
    }

    // K. ENVÍO Y TIEMPO DE ENTREGA
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

    // L. RECLAMO EN OFICINA INTERRAPIDÍSIMO
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

    // M. DESCUENTOS Y REBAJAS
    const discountWords = [
      'descuento', 'rebaja', 'cuanto es lo minimo', 'lo minimo', 'me rebaja', 'me hace descuento', 'rebajas'
    ];
    if (discountWords.some((w) => text.includes(w))) {
      return {
        matched: true,
        intent: 'DISCOUNTS_FAQ',
        response:
          `Nuestros mejores precios oficiales con Envío Gratis y Pago Contra Entrega son: Combo x1 (1 Par) por *$69.900* o el Combo Dúo (x2 Pares) en *$119.900* (ahorra $20.000). Si lleva el Combo Hogar Pack (x3 Pares) le queda en *$159.900* (ahorra $50.000) 🚚✨\n\n` +
          `¿Cuál de las opciones desea que le dejemos programada?`,
      };
    }

    // N. DESISTIMIENTO O "LO VOY A PENSAR"
    const declineWords = [
      'no gracias', 'muy caro', 'caro', 'pensar', 'pensarlo', 'voy a pensarlo',
      'ya no quiero', 'luego aviso', 'gracias no'
    ];
    if (declineWords.some((w) => text === w || (text.includes(w) && text.split(' ').length <= 6))) {
      return {
        matched: true,
        intent: 'DECLINED_OR_THINK',
        response:
          `Comprendemos totalmente 😊 Si más adelante desea coordinar su entrega o resolver cualquier duda sobre nuestras bases, con el mayor gusto quedamos a su entera disposición. ¡Que tenga un excelente día!`,
      };
    }

    // O. AGRADECIMIENTOS
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
