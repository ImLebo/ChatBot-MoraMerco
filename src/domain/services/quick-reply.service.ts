import { IButtonOption } from './message-handler.interface.js';
import { DataValidatorService } from './data-validator.service.js';

export type ChatState = 'NEW' | 'AWAITING_APPLIANCE' | 'PRICING_SENT' | 'DATA_REQUESTED' | 'CONFIRMATION_PENDING' | 'ORDER_CONFIRMED';

export interface QuickReplyResult {
  matched: boolean;
  intent?: string;
  response?: string;
  buttons?: IButtonOption[];
  nextState?: ChatState;
}

export class QuickReplyService {
  private readonly chatStates = new Map<string, ChatState>();

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
  }

  /**
   * Evalúa el mensaje con memoria de estado para dar respuestas ultra rápidas,
   * cálidas, humanas, concisas y con buen ofrecimiento comercial
   */
  public matchQuickReply(rawText: string, jid: string): QuickReplyResult {
    const text = this.normalizeText(rawText);
    const currentState = this.getState(jid);

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
      return {
        matched: true,
        intent: 'CONFIRM_ORDER',
        nextState: 'ORDER_CONFIRMED',
        response:
          `¡Listo! Tu pedido quedó 100% CONFIRMADO y entra de inmediato a bodega para empaque y despacho hoy mismo 📦🎉\n\n` +
          `🚚 Te llegará en 2 a 4 días hábiles a tu domicilio con la transportadora y pagas en efectivo solo al recibir en tus manos 🙌\n\n` +
          `Apenas la transportadora genere el número de guía te lo compartiremos por aquí. ¡Mil gracias por confiar en MoraMerco! 😊✨`,
      };
    }

    // =========================================================================
    // 1. SALUDOS EN CONVERSACIÓN YA ACTIVA (NO REPETIR PITCH INICIAL)
    // =========================================================================
    const greetingWords = [
      'hola', 'buenas', 'buen dia', 'buenos dias', 'buenas tardes', 'buenas noches', 'hola?'
    ];
    const isGreeting = greetingWords.some((w) => text === w || (text.startsWith(w) && text.length <= w.length + 3));

    if (isGreeting && currentState !== 'NEW') {
      return {
        matched: true,
        intent: 'GREETING_ACTIVE_CHAT',
        response: `¡Hola! Por aquí sigo contigo con todo el gusto 😊 ¿Tienes alguna otra duda o te gustaría que programemos tu entrega?`,
      };
    }

    // =========================================================================
    // 2. RECEPCIÓN Y VALIDACIÓN RIGUROSA DE DATOS DE ENVÍO
    // =========================================================================
    if (currentState === 'DATA_REQUESTED' || currentState === 'CONFIRMATION_PENDING') {
      const isQuestion =
        text.includes('precio') ||
        text.includes('cuanto') ||
        text.includes('sirve') ||
        text.includes('garantia') ||
        text.includes('como se');

      const containsDataHints =
        text.includes('\n') ||
        rawText.includes('\n') ||
        text.length >= 20 ||
        /\d/.test(text) ||
        text.includes('barrio') ||
        text.includes('casa') ||
        text.includes('calle') ||
        text.includes('carrera') ||
        text.includes('cra');

      if (containsDataHints && !isQuestion) {
        const validation = DataValidatorService.validate(rawText);

        if (validation.isValid) {
          return {
            matched: true,
            intent: 'DATA_RECEIVED',
            nextState: 'CONFIRMATION_PENDING',
            buttons: [
              { id: 'CONFIRMAR', displayText: '✅ CONFIRMAR PEDIDO' }
            ],
            response:
              `¡Perfecto! Ya verifiqué tus datos para el despacho 📦✨\n\n` +
              `📦 *RESUMEN DE TU PEDIDO:*\n` +
              `• Envío: 100% GRATIS a tu puerta 🚚\n` +
              `• Pago: Contra entrega en efectivo al recibir\n` +
              `• Destino: ${validation.city || 'Confirmado'}\n` +
              `• Datos registrados:\n${rawText.trim()}\n\n` +
              `👇 *Para programar tu despacho hoy mismo:*\n` +
              `Toca la opción *CONFIRMAR* de abajo o responde *CONFIRMAR* (o *1*)`,
          };
        } else {
          // Datos incompletos, incoherentes o con dirección/celular inválidos
          return {
            matched: true,
            intent: 'DATA_INCOMPLETE',
            nextState: 'DATA_REQUESTED',
            response: validation.feedbackMessage,
          };
        }
      }
    }

    // =========================================================================
    // 3. ELECCIÓN DE COMPRA TRAS HABER VISTO PRECIOS (ESTADO PRICING_SENT)
    // =========================================================================
    if (currentState === 'PRICING_SENT') {
      const chooseSingleWords = [
        'solo nevera', 'la de nevera', 'para nevera', 'solo una', 'una sola',
        '1', 'una', 'la de 79900', '79900', '79.900', 'solo lavadora', 'la de lavadora',
        'una para nevera', 'una base', 'solo la de nevera', 'solo la nevera'
      ];
      const chooseKit2Words = [
        'el kit', 'el kit x2', 'kit x2', 'las dos', 'ambas', 'los dos', 'el de dos',
        '139900', '139.900', '2', 'el kit de 2', 'quiero el kit', 'kit 2', 'las 2',
        'el kit promocional', 'las dos bases', 'los 2'
      ];
      const chooseKit3Words = [
        'kit x3', 'kit 3', 'las 3', 'los 3', 'las tres', '189900', '3', 'tres', 'kit de 3'
      ];
      const generalAcceptWords = [
        'si apartamelo', 'si apartamela', 'mandamelo', 'mandamela', 'quiero pedir',
        'quiero comprar', 'si dale', 'dale', 'apartamela', 'apartamelo', 'si quiero'
      ];

      // A. Cliente elige 1 Unidad
      if (chooseSingleWords.some((w) => text === w || (text.includes(w) && text.split(' ').length <= 7))) {
        return {
          matched: true,
          intent: 'SELECT_SINGLE',
          nextState: 'DATA_REQUESTED',
          response:
            `¡Listo, con mucho gusto! Te la dejamos programada para despacho hoy mismo 📦✨\n\n` +
            `Para coordinar tu *Envío Gratis* y pago contra entrega en casa por *$79.900*, compárteme porfa:\n` +
            `• Nombre completo:\n` +
            `• Ciudad y Barrio:\n` +
            `• Dirección exacta:\n` +
            `• Celular:`,
        };
      }

      // B. Cliente elige Kit x2
      if (chooseKit2Words.some((w) => text === w || (text.includes(w) && text.split(' ').length <= 7))) {
        return {
          matched: true,
          intent: 'SELECT_KIT2',
          nextState: 'DATA_REQUESTED',
          response:
            `¡Excelente elección con el *KIT x2*! 🎉 (Aprovechas el súper ahorro de $19.900)\n\n` +
            `Para programar tu despacho hoy mismo con *Envío Gratis* y pago contra entrega en casa por *$139.900*, compárteme porfa:\n` +
            `• Nombre completo:\n` +
            `• Ciudad y Barrio:\n` +
            `• Dirección exacta:\n` +
            `• Celular:`,
        };
      }

      // C. Cliente elige Kit x3
      if (chooseKit3Words.some((w) => text === w || (text.includes(w) && text.split(' ').length <= 7))) {
        return {
          matched: true,
          intent: 'SELECT_KIT3',
          nextState: 'DATA_REQUESTED',
          response:
            `¡Espectacular elección con el *KIT x3*! 🎉 (Aprovechas el ahorro máximo de $50.000)\n\n` +
            `Para programar tu despacho hoy mismo con *Envío Gratis* y pago contra entrega en casa por *$189.900*, compárteme porfa:\n` +
            `• Nombre completo:\n` +
            `• Ciudad y Barrio:\n` +
            `• Dirección exacta:\n` +
            `• Celular:`,
        };
      }

      // D. Aceptación general de compra
      if (generalAcceptWords.some((w) => text === w || text.includes(w))) {
        return {
          matched: true,
          intent: 'ACCEPT_ORDER',
          nextState: 'DATA_REQUESTED',
          response:
            `¡Listo, con muchísimo gusto! Te dejamos todo programado hoy mismo 📦✨\n\n` +
            `Para programar tu entrega con *Envío Gratis* y pago contra entrega en casa, compárteme porfa:\n` +
            `• Nombre completo:\n` +
            `• Ciudad y Barrio:\n` +
            `• Dirección exacta:\n` +
            `• Celular:`,
        };
      }
    }

    // =========================================================================
    // 4. EL CLIENTE INDICA QUÉ ELECTRODOMÉSTICO TIENE (OFRECIMIENTO CÁLIDO)
    // =========================================================================
    // Cuando el cliente responde "¿La buscas para nevera, lavadora o ambas?",
    // NO le pedimos datos todavía. Le explicamos cómo le sirve y le ofrecemos 1 vs Kit x2.
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
            `¡Súper! Para tu nevera te queda a la medida porque se gradúa de 40 a 70 cm y soporta hasta 200 kg con ruedas y freno ✨\n\n` +
            `Manejamos estas opciones con *Envío Gratis* y pago en casa 🚚:\n` +
            `🔹 *1 Base (para tu nevera):* $79.900\n` +
            `🔥 *KIT x2 (aprovechas para lavadora también):* $139.900 (te ahorras $19.900)\n\n` +
            `¿Te gustaría llevar solo la de la nevera o prefieres aprovechar la promo del Kit x2?`,
        };
      }

      if (isMentioningWasher) {
        return {
          matched: true,
          intent: 'OFFER_WASHER',
          nextState: 'PRICING_SENT',
          response:
            `¡Súper! Para tu lavadora te queda a la medida porque se gradúa de 40 a 70 cm y sus ruedas con freno evitan que vibre o se mueva al centrifugar ✨\n\n` +
            `Manejamos estas opciones con *Envío Gratis* y pago en casa 🚚:\n` +
            `🔹 *1 Base (para tu lavadora):* $79.900\n` +
            `🔥 *KIT x2 (aprovechas para nevera también):* $139.900 (te ahorras $19.900)\n\n` +
            `¿Te gustaría llevar solo la de lavadora o prefieres aprovechar la promo del Kit x2?`,
        };
      }

      if (isMentioningBoth) {
        return {
          matched: true,
          intent: 'OFFER_BOTH',
          nextState: 'PRICING_SENT',
          response:
            `¡Excelente decisión! El *KIT x2* es el más vendido porque dejas ambos equipos protegidos de la humedad y fáciles de mover 🎉\n\n` +
            `Te queda en *$139.900* con *Envío Gratis* y pago en efectivo al recibir en casa (ahorras $19.900).\n\n` +
            `¿Te gustaría que te lo apartemos para despacho hoy mismo?`,
        };
      }
    }

    // =========================================================================
    // 5. ATAJOS RÁPIDOS Y PREGUNTAS FRECUENTES (BREVES, CÁLIDAS Y AL GRANO)
    // =========================================================================

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
          `¡Totalmente! Soporta hasta 200 kg, no se oxida y las ruedas traen freno para quedar bien firme. Te salva de dolores de espalda al moverla y limpia tus pisos fácil 😊\n\n` +
          `Manejamos 1 Unidad en $79.900 o el Kit x2 en promo por $139.900 (ahorras $19.900) con Envío Gratis y pagas al recibir 🚚\n\n` +
          `¿Te gustaría probar una o prefieres aprovechar la promo del Kit x2?`,
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
          `¡Es súper resistente! Tiene barras de acero inoxidable anticorrosivo y esquinas de alto impacto (no se oxida con el trapero). Aguanta hasta 200 kg y las ruedas traen freno de seguridad 💪✨\n\n` +
          `Manejamos 1 Unidad ($79.900) y Kit x2 ($139.900 con $19.900 de ahorro) con Envío Gratis y pago en casa 🚚\n\n` +
          `¿Para cuántos equipos la necesitas?`,
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
          `¡Cero riesgo y total tranquilidad! 🙌💛 Pagas en efectivo en tu casa únicamente cuando recibes el producto en tus manos. Además cuentas con 30 días de garantía directa por fábrica.\n\n` +
          `¿Para qué ciudad o municipio sería tu entrega?`,
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
          `¡Pagas contra entrega en efectivo al recibir en la puerta de tu casa! 💵🙌 (Muchos transportadores también reciben Nequi o Bancolombia al momento de entregarte).\n\n` +
          `¿Te gustaría ordenar 1 Unidad ($79.900) o el Kit x2 en promo ($139.900)?`,
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
          `¡Es facilísima! Se arma en menos de 3 minutos sin herramientas 🛠️✨ Solo unes los tubos a las esquinas, ajustas a la medida de tu equipo (de 40 a 70 cm) y bajas los seguros.\n\n` +
          `¿La buscas para tu nevera, lavadora o para ambas?`,
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
          `Despachamos desde nuestras bodegas principales en Bogotá y Medellín directamente hasta tu puerta en toda Colombia 🇨🇴🚚 El envío es 100% Gratis y pagas al recibir.\n\n` +
          `¿En qué ciudad te encuentras para coordinar tu entrega?`,
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
          `¡Hola! Claro que sí, con mucho gusto aquí estoy contigo 😊 Soy Maria Paula, asesora de MoraMerco. Cuéntame con toda confianza qué inquietud tienes y te ayudo de una.`,
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
          `¡Le queda perfecta a cualquier equipo estándar! Se gradúa desde 40x40 cm hasta 70x70 cm y soporta hasta 200 kg ✨\n\n` +
          `Manejamos 1 Unidad ($79.900) y Kit x2 ($139.900 con $19.900 de ahorro) con Envío Gratis y pago en casa 🚚\n\n` +
          `¿Cuántas unidades necesitas para tus equipos?`,
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
          `El envío es 100% *GRATIS* a toda Colombia y pagas en efectivo al recibir en tu puerta 🙌 Te llega en 2 a 4 días hábiles por Coordinadora o Servientrega 📦\n\n` +
          `¿En qué ciudad te encuentras?`,
      };
    }

    // J. AGRADECIMIENTOS
    const thanksWords = ['gracias', 'muchas gracias', 'mil gracias', 'muy amable'];
    if (thanksWords.some((w) => text === w || text.startsWith(w))) {
      return {
        matched: true,
        intent: 'THANKS',
        response:
          `¡Con muchísimo gusto! Es todo un placer atenderte 😊✨ Cualquier cosita que necesites, aquí estaré con mucho gusto.`,
      };
    }

    // =========================================================================
    // 6. FLUJO INICIAL: PRIMERA VEZ (ESTADO NEW)
    // =========================================================================
    const priceWords = [
      'precio', 'precios', 'cuanto vale', 'cuanto cuesta', 'costo', 'valor',
      'a como', 'a cuanto', 'que vale', 'que precio', 'cual es el precio', 'cual es el costo'
    ];
    const hasPrice = priceWords.some((w) => text.includes(w));

    // Si pregunta por precio directamente
    if (hasPrice) {
      return {
        matched: true,
        intent: 'PRICE',
        nextState: 'PRICING_SENT',
        response:
          `¡Con gusto! Manejamos estas opciones con *Envío Gratis* y pago contra entrega en casa 🚚:\n\n` +
          `🔹 *1 Base:* $79.900\n` +
          `🔥 *KIT x2 (Nevera + Lavadora):* $139.900 (Ahorras $19.900)\n` +
          `✨ *KIT x3:* $189.900 (Ahorras $50.000)\n\n` +
          `¿La buscas para 1 equipo o te gustaría aprovechar la promo del Kit x2?`,
      };
    }

    // Saludo inicial simple (Primera vez)
    if (isGreeting) {
      return {
        matched: true,
        intent: 'GREETING',
        nextState: 'AWAITING_APPLIANCE',
        response:
          `¡Hola! Qué gusto saludarte, soy Maria Paula de MoraMerco 😊\n\n` +
          `Con muchísimo gusto te ayudo. ¿La base la buscas para tu nevera, lavadora o para ambas?`,
      };
    }

    // No coincidió con una respuesta rápida local -> Dejar a Gemini AI
    return { matched: false };
  }
}

