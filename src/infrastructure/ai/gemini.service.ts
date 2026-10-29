import { GoogleGenAI } from '@google/genai';
import { IAiService } from '../../domain/services/ai-service.interface.js';
import { ProductConfig } from '../../domain/models/product.model.js';
import { buildSystemPrompt } from '../../domain/prompts/store-system.prompt.js';
import { DEFAULT_PRODUCT } from '../../config/products.config.js';
import { FuzzyMatcherService } from '../../domain/services/fuzzy-matcher.service.js';

interface ChatHistoryItem {
  role: 'user' | 'model';
  parts: Array<{ text: string }>;
}

export class GeminiService implements IAiService {
  private ai: GoogleGenAI | null = null;
  private readonly conversationHistory = new Map<string, ChatHistoryItem[]>();
  private readonly maxHistoryRounds = 8; // Mantiene los últimos 4 turnos (4 usuario + 4 modelo)

  constructor(
    private readonly apiKey?: string,
    private readonly modelName: string = 'gemini-2.5-flash',
    private readonly fallbackModelName: string = 'gemini-1.5-flash'
  ) {
    if (this.apiKey && this.apiKey.trim().length > 0) {
      this.ai = new GoogleGenAI({ apiKey: this.apiKey.trim() });
    }
  }

  public async generateResponse(
    senderId: string,
    userMessage: string,
    senderName?: string,
    product?: ProductConfig
  ): Promise<string> {
    const targetProduct = product || DEFAULT_PRODUCT;

    // Si no se ha configurado la API Key, resolver de forma asistida inteligente
    if (!this.ai) {
      return this.generateIntelligentFallback(senderId, userMessage, targetProduct);
    }

    try {
      // 1. Obtener o inicializar el historial de conversación del contacto
      const history = this.conversationHistory.get(senderId) || [];

      // 2. Agregar el mensaje actual del usuario al historial
      const userContent: ChatHistoryItem = {
        role: 'user',
        parts: [{ text: userMessage }],
      };
      history.push(userContent);

      // 3. Limitar el historial a los últimos turnos para optimizar tokens y costes
      const limitedHistory = history.slice(-this.maxHistoryRounds);
      const isOngoing = history.length > 1;

      // Inyección dinámica del contexto del producto seleccionado
      const currentSystemInstruction = buildSystemPrompt(targetProduct, isOngoing);

      // 4. Llamar a Gemini con el System Prompt oficial dinámico de MoraMerco
      let response;
      try {
        response = await this.ai.models.generateContent({
          model: this.modelName,
          contents: limitedHistory,
          config: {
            systemInstruction: currentSystemInstruction,
            temperature: 0.5,
            maxOutputTokens: 500,
          },
        });
      } catch (err: any) {
        console.warn(`⚠️ Error en modelo principal (${this.modelName}): ${err?.message || err}. Conmutando automáticamente a modelo secundario (${this.fallbackModelName})...`);
        try {
          response = await this.ai.models.generateContent({
            model: this.fallbackModelName,
            contents: limitedHistory,
            config: {
              systemInstruction: currentSystemInstruction,
              temperature: 0.5,
              maxOutputTokens: 500,
            },
          });
          console.log(`✅ Respuesta generada exitosamente con el modelo secundario (${this.fallbackModelName}).`);
        } catch (fallbackErr: any) {
          console.error(`❌ Ambos modelos (${this.modelName} y ${this.fallbackModelName}) fallaron:`, fallbackErr?.message || fallbackErr);
          throw fallbackErr;
        }
      }

      let replyText = response.text?.trim() || 'Con gusto te ayudo. ¿Cuál de los tonos te gustaría para tu hogar: Cálida, Blanca o Multicolor?';

      // Si la conversación ya está en curso, sanitizar cualquier saludo repetitivo que el modelo genere
      if (isOngoing) {
        replyText = replyText
          .replace(/^¡?hola!?,?\s*(soy maria paula,?\s*)?(bienvenido a moramerco\s*([😊✨🙌])?)?\s*/i, '')
          .replace(/^(un cordial saludo|muy buenas tardes|buenos dias|buen dia)[.,!😊✨🙌\s]*/i, '')
          .trim();
        if (replyText.length > 0) {
          replyText = replyText.charAt(0).toUpperCase() + replyText.slice(1);
        }
      }

      // 5. Agregar la respuesta del modelo al historial
      history.push({
        role: 'model',
        parts: [{ text: replyText }],
      });

      // Guardar el historial actualizado
      this.conversationHistory.set(senderId, history.slice(-this.maxHistoryRounds));

      return replyText;
    } catch (error) {
      console.error(`❌ Error en Gemini AI para el chat [${senderId}]:`, error);
      return this.generateIntelligentFallback(senderId, userMessage, targetProduct);
    }
  }

  /**
   * Genera una respuesta inteligente de contingencia basada en la intención real del usuario
   * evitando respuestas repetitivas o mensajes fríos.
   */
  private generateIntelligentFallback(
    senderId: string,
    userMessage: string,
    targetProduct: ProductConfig
  ): string {
    const isOngoing = (this.conversationHistory.get(senderId) || []).length > 1;

    // 1. Si el cliente tiene una duda específica de forma, estrellas, árboles, balcón, clima, etc.
    if (FuzzyMatcherService.hasQuestionOrDoubt(userMessage)) {
      const topic = FuzzyMatcherService.detectDoubtTopic(userMessage);
      const answer = FuzzyMatcherService.getDoubtAnswer(topic);
      return `${answer}\n\n¿Te gustaría en luz *Cálida*, *Blanca* o *Multicolor*? Quedo muy atenta para asesorarte 🙌`;
    }

    // 2. Si es una conversación en curso
    const firstCombo = targetProduct.pricingCombos[0];
    const duoCombo = targetProduct.pricingCombos[1] || firstCombo;

    if (isOngoing) {
      return (
        `¡Con mucho gusto te oriento! 😊 Recuerda que tenemos disponibles 3 tonos: *Cálida* ✨, *Blanca* 💡 y *Multicolor* 🌈\n\n` +
        `El más pedido es el *${duoCombo.label}* en *$${duoCombo.price.toLocaleString('es-CO')}* (ahorras $30.000) o 1 unidad en *$${firstCombo.price.toLocaleString('es-CO')}* con Envío Gratis y pago contra entrega 🚚\n\n` +
        `¿Cuál de los tonos te gustaría para tu hogar?`
      );
    }

    // 3. Primer contacto
    const combosText = targetProduct.pricingCombos
      .map((c) => {
        const savings = c.savings ? ` (Ahorras $${c.savings.toLocaleString('es-CO')})` : '';
        return `• ${c.label}: $${c.price.toLocaleString('es-CO')}${savings}`;
      })
      .join('\n');

    return (
      `¡Hola! Soy Maria Paula de MoraMerco 😊 Con mucho gusto te asesoro sobre nuestras *${targetProduct.name}* 🎄✨\n\n` +
      `Cuentan con panel solar recargable, sensor inteligente al anochecer y certificación impermeable IP65 🌧️\n` +
      `Disponibles en: *Cálida*, *Blanca* y *Multicolor* 🌈\n\n` +
      `🚚 *Precios con Envío GRATIS y Pago Contra Entrega en efectivo:*\n` +
      `${combosText}\n\n` +
      `¿Cuál de las opciones te dejamos programada?`
    );
  }

  public recordExchange(senderId: string, userMessage: string, botReply: string): void {
    const history = this.conversationHistory.get(senderId) || [];
    history.push({
      role: 'user',
      parts: [{ text: userMessage }],
    });
    history.push({
      role: 'model',
      parts: [{ text: botReply }],
    });
    this.conversationHistory.set(senderId, history.slice(-this.maxHistoryRounds));
  }

  public getHistory(senderId: string): ChatHistoryItem[] {
    return this.conversationHistory.get(senderId) || [];
  }
}
