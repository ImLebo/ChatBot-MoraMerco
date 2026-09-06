import path from 'path';
import fs from 'fs';
import { IButtonOption } from './message-handler.interface.js';
import { DataValidatorService, CustomerShippingData } from './data-validator.service.js';

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

    // Ruta de la imagen del producto (prioriza fotobase.jpeg o base_producto.jpg)
    const primaryImg = path.resolve(process.cwd(), 'assets/fotobase.jpeg');
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

    // Si el cliente pide 2 unidades / Kit x2 Y además pide foto (ej: "2 Puede enviar fotp")
    const mentionsKit2InPhoto =
      text.includes('2') || text.includes('kit') || text.includes('ambas') || text.includes('dos');

    if (isPhotoRequest && mentionsKit2InPhoto) {
      this.customerProduct.set(jid, { description: 'KIT x2 Nevera + Lavadora ($139.900)', price: 139900 });
      return {
        matched: true,
        intent: 'SELECT_KIT2_WITH_PHOTO',
        nextState: 'DATA_REQUESTED',
        mediaPath: productMedia,
        response:
          `¡Excelente elección con el *KIT x2*! 🎉 ($139.900 con Envío Gratis y pago en casa).\n\n` +
          `Aquí le comparto la foto 📸✨ Es graduable (40 a 70 cm), en acero inoxidable con ruedas y freno.\n\n` +
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
            `Es en acero inoxidable, graduable (40 a 70 cm) y soporta 200 kg con ruedas y freno.\n\n` +
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
            `Es graduable (40 a 70 cm), en acero inoxidable con ruedas y freno (soporta hasta 200 kg).\n\n` +
            `¿Desea ordenar 1 Base ($79.900) o aprovechar la oferta del Kit x2 ($139.900)?`,
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
          `¡Hola! Soy Maria Paula, bienvenido a MoraMerco 😊 Aquí le comparto la foto 📸✨\n\n` +
          `Es graduable (40 a 70 cm), metálica con ruedas y freno (soporta 200 kg).\n\n` +
          `🚚 *Envío Gratis y pago contra entrega:*\n` +
          `🔹 1 Base: $79.900\n` +
          `🔥 KIT x2: $139.900 (Ahorra $19.900)\n\n` +
          `¿La busca para 1 electrodoméstico o desea el Kit x2?`,
      };
    }

    // =========================================================================
    // 2. RECEPCIÓN Y VALIDACIÓN DE DATOS DE ENVÍO CON MEMORIA ACUMULADA
    // =========================================================================
    if (currentState === 'DATA_REQUESTED' || currentState === 'CONFIRMATION_PENDING') {
      const isQuestion =
        text.includes('precio') ||
        text.includes('cuanto') ||
        text.includes('sirve') ||
        text.includes('garantia') ||
        text.includes('como se') ||
        text.includes('aguanta') ||
        text.includes('peso') ||
        text.includes('cuando') ||
        text.includes('demora') ||
        text.includes('seguro');

      const containsDataHints =
        text.includes('\n') ||
        rawText.includes('\n') ||
        text.length >= 8 ||
        /\d/.test(text) ||
        text.includes('barrio') ||
        text.includes('casa') ||
        text.includes('calle') ||
        text.includes('carrera') ||
        text.includes('cra') ||
        text.includes('cll') ||
        text.includes('interrapidisimo') ||
        text.includes('enterrapidicimo') ||
        text.includes('oficina') ||
        text.includes('servientrega') ||
        text.includes('coordinadora') ||
        text.includes('envia') ||
        text.includes('santander') ||
        text.includes('boyaca') ||
        text.includes('cundinamarca') ||
        text.includes('medellin') ||
        text.includes('bogota') ||
        text.includes('suaita');

      if (containsDataHints && !isQuestion) {
        const previousData = this.customerData.get(jid);
        const validation = DataValidatorService.validate(rawText, previousData);

        this.customerData.set(jid, validation);

        if (validation.isValid) {
          const product = this.customerProduct.get(jid)?.description || '1 Base ($79.900)';
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
              `¡Perfecto! Datos verificados para despacho 📦✨\n\n` +
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
            response: validation.feedbackMessage,
          };
        }
      }

      return { matched: false };
    }

    // =========================================================================
    // 3. ELECCIÓN DE COMPRA DIRECTA (EL CLIENTE DICE QUÉ DESEA LLEVAR)
    // =========================================================================
    const chooseSingleWords = [
      'solo nevera', 'la de nevera', 'para nevera', 'solo una', 'una sola',
      '1', 'una', 'la de 79900', '79900', '79.900', 'solo lavadora', 'la de lavadora',
      'una para nevera', 'una base', 'solo la de nevera', 'solo la nevera',
      'quiero una', 'quiero 1', 'quiero el uno', 'el uno', 'mandame una', 'deseo una',
      'aparta una', 'quiero una sola', 'la de 79', 'la primera', 'opcion 1', 'la opcion 1',
      'quiero una base', 'para nevera una', 'quiero la de nevera', 'quiero la de lavadora'
    ];
    const chooseKit2Words = [
      'el kit', 'el kit x2', 'kit x2', 'las dos', 'ambas', 'los dos', 'el de dos',
      '139900', '139.900', '2', 'el kit de 2', 'quiero el kit', 'kit 2', 'las 2',
      'el kit promocional', 'las dos bases', 'los 2', 'quiero las dos', 'quiero los dos',
      'el combo', 'la promo', 'las dos para nevera y lavadora'
    ];
    const chooseKit3Words = [
      'kit x3', 'kit 3', 'las 3', 'los 3', 'las tres', '189900', '3', 'tres', 'kit de 3'
    ];
    const generalAcceptWords = [
      'si apartamelo', 'si apartamela', 'mandamelo', 'mandamela', 'quiero pedir',
      'quiero comprar', 'si dale', 'dale', 'apartamela', 'apartamelo', 'si quiero'
    ];

    const wantsSingle =
      chooseSingleWords.some((w) => text === w || text.includes(w)) &&
      (text.includes('quiero') || text.includes('mand') || text.includes('apart') || text.includes('deseo') || text.includes('sola') || text.includes('solo') || text.includes('el uno') || text.includes('primera') || currentState === 'PRICING_SENT');

    const wantsKit2 =
      chooseKit2Words.some((w) => text === w || text.includes(w)) &&
      (text.includes('quiero') || text.includes('mand') || text.includes('apart') || text.includes('kit') || text.includes('dos') || text.includes('ambas') || currentState === 'PRICING_SENT');

    const wantsKit3 =
      chooseKit3Words.some((w) => text === w || text.includes(w));

    if (wantsKit3) {
      this.customerProduct.set(jid, { description: 'KIT x3 ($189.900)', price: 189900 });
      return {
        matched: true,
        intent: 'SELECT_KIT3',
        nextState: 'DATA_REQUESTED',
        response:
          `Excelente elección con el *KIT x3* 🎉 ($189.900 con Envío Gratis y pago contra entrega).\n\n` +
          `Por favor facilítenos sus datos para el despacho:\n` +
          `• Nombre y apellido:\n` +
          `• Ciudad/Municipio y Departamento:\n` +
          `• Dirección (o si prefiere oficina Interrapidísimo):\n` +
          `• Número de celular:`,
      };
    }

    if (wantsKit2) {
      this.customerProduct.set(jid, { description: 'KIT x2 Nevera + Lavadora ($139.900)', price: 139900 });
      return {
        matched: true,
        intent: 'SELECT_KIT2',
        nextState: 'DATA_REQUESTED',
        response:
          `Excelente elección con el *KIT x2* 🎉 ($139.900 con Envío Gratis y pago contra entrega).\n\n` +
          `Por favor facilítenos sus datos para el despacho:\n` +
          `• Nombre y apellido:\n` +
          `• Ciudad/Municipio y Departamento:\n` +
          `• Dirección (o si prefiere oficina Interrapidísimo):\n` +
          `• Número de celular:`,
      };
    }

    if (wantsSingle) {
      let productDesc = '1 Base ($79.900)';
      if (text.includes('nevera')) productDesc = '1 Base para Nevera ($79.900)';
      else if (text.includes('lavadora')) productDesc = '1 Base para Lavadora ($79.900)';
      this.customerProduct.set(jid, { description: productDesc, price: 79900 });

      return {
        matched: true,
        intent: 'SELECT_SINGLE',
        nextState: 'DATA_REQUESTED',
        response:
          `Con mucho gusto. Se la programamos hoy mismo por *$79.900* con Envío Gratis y pago contra entrega 📦🚚\n\n` +
          `Por favor facilítenos sus datos para el despacho:\n` +
          `• Nombre y apellido:\n` +
          `• Ciudad/Municipio y Departamento:\n` +
          `• Dirección (o si prefiere oficina Interrapidísimo):\n` +
          `• Número de celular:`,
      };
    }

    if (generalAcceptWords.some((w) => text === w || text.includes(w))) {
      if (!this.customerProduct.has(jid)) {
        this.customerProduct.set(jid, { description: '1 Base ($79.900)', price: 79900 });
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
            `Con gusto le confirmo: 1 Base le queda en *$79.900* o el Kit x2 en *$139.900* (Envío Gratis y pago contra entrega en efectivo) 🚚\n\n` +
            `¿Desea ordenar 1 Base o prefiere el Kit x2?`,
        };
      }
      if (hasInfo) {
        return {
          matched: true,
          intent: 'INFO_REMINDER',
          response:
            `Nuestra base es graduable (40 a 70 cm), metálica con ruedas y freno (soporta 200 kg) 🛠️✨\n\n` +
            `1 Base: $79.900 | Kit x2: $139.900 (Envío Gratis y pago en casa 🚚)\n\n` +
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
          `¡Hola! Soy Maria Paula, bienvenido a MoraMerco 😊\n\n` +
          `Nuestra base es metálica, ajustable (40 a 70 cm) con ruedas y freno (soporta 200 kg) 🛠️✨\n\n` +
          `🚚 *Envío Gratis y Pago Contra Entrega en efectivo:*\n` +
          `🔹 1 Base: $79.900\n` +
          `🔥 KIT x2 (Nevera + Lavadora): $139.900 (Ahorra $19.900)\n` +
          `✨ KIT x3: $189.900 (Ahorra $50.000)\n\n` +
          `¿La busca para nevera, lavadora o desea el Kit x2?`,
      };
    }

    if (hasPrice) {
      return {
        matched: true,
        intent: 'PRICE',
        nextState: 'PRICING_SENT',
        response:
          `¡Hola! Soy Maria Paula, bienvenido a MoraMerco 😊\n\n` +
          `🚚 *Envío Gratis y Pago Contra Entrega en efectivo:*\n` +
          `🔹 1 Base: $79.900\n` +
          `🔥 KIT x2 (Nevera + Lavadora): $139.900 (Ahorra $19.900)\n` +
          `✨ KIT x3: $189.900 (Ahorra $50.000)\n\n` +
          `¿La busca para 1 electrodoméstico o prefiere el Kit x2?`,
      };
    }

    if (isGreeting) {
      return {
        matched: true,
        intent: 'GREETING',
        nextState: 'AWAITING_APPLIANCE',
        response:
          `¡Hola! Soy Maria Paula, bienvenido a MoraMerco 😊\n\n` +
          `¿La base la busca para su nevera, lavadora o para ambos equipos?`,
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
    const isMentioningBoth = ['ambas', 'las dos', 'los dos', 'las 2', 'para ambas', 'para las dos', 'nevera y lavadora', 'lavadora y nevera', 'kit x2'].some(
      (w) => text === w || (text.includes(w) && text.split(' ').length <= 7)
    );

    if (currentState === 'AWAITING_APPLIANCE' || currentState === 'NEW') {
      if (isMentioningFridge) {
        return {
          matched: true,
          intent: 'OFFER_FRIDGE',
          nextState: 'PRICING_SENT',
          response:
            `Con mucho gusto. Para su nevera le queda a la medida (se gradúa de 40 a 70 cm y soporta 200 kg con ruedas y freno) ✨\n\n` +
            `🔹 *1 Base:* $79.900\n` +
            `🔥 *KIT x2 (Nevera + Lavadora):* $139.900 (Ahorra $19.900)\n\n` +
            `¿Desea solo para nevera o prefiere la promoción del Kit x2?`,
        };
      }

      if (isMentioningWasher) {
        return {
          matched: true,
          intent: 'OFFER_WASHER',
          nextState: 'PRICING_SENT',
          response:
            `Con mucho gusto. Para su lavadora le queda a la medida (evita que vibre y soporta 200 kg con ruedas y freno) ✨\n\n` +
            `🔹 *1 Base:* $79.900\n` +
            `🔥 *KIT x2 (Nevera + Lavadora):* $139.900 (Ahorra $19.900)\n\n` +
            `¿Desea solo para lavadora o prefiere la promoción del Kit x2?`,
        };
      }

      if (isMentioningBoth) {
        return {
          matched: true,
          intent: 'OFFER_BOTH',
          nextState: 'PRICING_SENT',
          response:
            `Excelente decisión. El *KIT x2* le queda en *$139.900* con Envío Gratis y pago contra entrega en efectivo (ahorra $19.900) ✨\n\n` +
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

    // A. ¿ESO SÍ SIRVE? / FUNCIONA / RESISTENCIA
    const doesItWorkWords = [
      'eso si sirve', 'si sirve', 'sirve', 'funciona', 'que tal es', 'sale buena',
      'es buena', 'si aguanta', 'vale la pena', 'que tan buena es'
    ];
    if (doesItWorkWords.some((w) => text.includes(w))) {
      return {
        matched: true,
        intent: 'DOES_IT_WORK',
        response:
          `Totalmente garantizado. Soporta 200 kg, es anticorrosiva y tiene ruedas con freno para mover su equipo fácil y proteger sus pisos 😊\n\n` +
          `1 Base: $79.900 | Kit x2: $139.900 (Envío Gratis y pago contra entrega 🚚)\n\n` +
          `¿Desea ordenar 1 Base o la oferta del Kit x2?`,
      };
    }

    // B. MATERIAL, RESISTENCIA, PESO SOPORTADO
    const materialWords = [
      'material', 'de que esta hecho', 'de que material', 'soporta', 'cuanto peso aguanta',
      'peso maximo', 'se oxida', 'acero', 'plastico', 'frenos', 'ruedas', 'aguanta el centrifugado',
      'vibra', 'es resistente', 'que peso resiste'
    ];
    if (materialWords.some((w) => text.includes(w))) {
      return {
        matched: true,
        intent: 'MATERIAL_AND_RESISTANCE',
        response:
          `Es de excelente resistencia: barras de acero inoxidable, esquinas antideslizantes y ruedas con freno. Soporta hasta 200 kg ✨\n\n` +
          `1 Base: $79.900 | Kit x2: $139.900 (Envío Gratis y pago en casa 🚚)\n\n` +
          `¿Para cuántos equipos la necesita?`,
      };
    }

    // C. GARANTÍA Y CONFIANZA (ANTI-ESTAFA)
    const trustWords = [
      'garantia', 'es seguro', 'confiable', 'estafa', 'como se que llega',
      'testimonios', 'seguridad', 'tienen garantia', 'como se que no es estafa'
    ];
    if (trustWords.some((w) => text.includes(w))) {
      return {
        matched: true,
        intent: 'WARRANTY_AND_TRUST',
        response:
          `Total tranquilidad: abona el valor en efectivo al recibir el producto en sus manos y cuenta con garantía de 30 días de fábrica 🙌\n\n` +
          `¿En qué ciudad o municipio se encuentra para su entrega?`,
      };
    }

    // D. MEDIOS DE PAGO
    const paymentWords = [
      'medios de pago', 'formas de pago', 'como se paga', 'metodo de pago', 'metodos de pago',
      'nequi', 'bancolombia', 'daviplata', 'transferencia', 'tarjeta', 'efectivo', 'contraentrega'
    ];
    if (paymentWords.some((w) => text.includes(w))) {
      return {
        matched: true,
        intent: 'PAYMENT_METHODS',
        response:
          `Cancela contra entrega en efectivo al recibir en su puerta o en oficina 💵 (También puede por Nequi/Bancolombia al momento de recibir).\n\n` +
          `¿Desea 1 Base ($79.900) o el Kit x2 en promoción ($139.900)?`,
      };
    }

    // E. INSTALACIÓN Y ARMADO
    const installWords = [
      'como se instala', 'como se arma', 'armado', 'instalacion', 'dificil de armar',
      'viene armada', 'herramientas', 'facil de armar'
    ];
    if (installWords.some((w) => text.includes(w))) {
      return {
        matched: true,
        intent: 'INSTALLATION',
        response:
          `Se ensambla en 2 minutos sin herramientas 🛠️✨ Solo une los tubos a las esquinas a la medida de su equipo (40 a 70 cm) y baja los seguros.\n\n` +
          `¿La busca para nevera, lavadora o para ambas?`,
      };
    }

    // F. UBICACIÓN Y BODEGAS
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

    // G. ASESOR HUMANO
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

    // H. MEDIDAS
    const measurementWords = [
      'medidas', 'cuanto mide', 'tamano', 'dimensiones', 'que medidas tiene', 'cuales son las medidas'
    ];
    if (measurementWords.some((w) => text.includes(w))) {
      return {
        matched: true,
        intent: 'MEASUREMENTS',
        nextState: 'PRICING_SENT',
        response:
          `Es graduable desde 40x40 cm hasta 70x70 cm y soporta hasta 200 kg ✨\n\n` +
          `1 Base: $79.900 | Kit x2: $139.900 con Envío Gratis y pago en casa 🚚\n\n` +
          `¿Cuántas unidades necesita?`,
      };
    }

    // I. ENVÍO Y TIEMPO DE ENTREGA
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

    // J. AGRADECIMIENTOS
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
