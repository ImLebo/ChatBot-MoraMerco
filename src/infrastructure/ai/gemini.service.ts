import { GoogleGenAI } from '@google/genai';
import { IAiService } from '../../domain/services/ai-service.interface.js';
import { ProductConfig } from '../../domain/models/product.model.js';
import { buildSystemPrompt } from '../../domain/prompts/store-system.prompt.js';
import { DEFAULT_PRODUCT } from '../../config/products.config.js';

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
    private readonly modelName: string = 'gemini-3.1-flash-lite',
    private readonly fallbackModelName: string = 'gemini-2.5-flash-lite'
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

    // Si no se ha configurado la API Key, dar respuesta de contingencia con el producto activo
    if (!this.ai) {
      const combosPreview = targetProduct.pricingCombos
        .map((c) => `${c.label} a $${c.price.toLocaleString('es-CO')}`)
        .join(' | ');

      return (
        `¡Hola! Soy Maria Paula de MoraMerco 😊\n\n` +
        `📦 Manejamos *${targetProduct.name}*:\n${combosPreview} con ENVÍO GRATIS y PAGO CONTRA ENTREGA en efectivo 🚚\n\n` +
        `⚠️ (Nota: Configura tu GEMINI_API_KEY en el archivo .env para activar las respuestas con IA).`
      );
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

      let replyText = response.text?.trim() || 'Con gusto le ayudo. ¿Cuál de las opciones le apartamos?';

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

      const firstCombo = targetProduct.pricingCombos[0];
      const secondCombo = targetProduct.pricingCombos[1] || firstCombo;

      if (this.conversationHistory.get(senderId) && this.conversationHistory.get(senderId)!.length > 1) {
        return (
          `Con gusto le confirmo: ${firstCombo.label} le queda en *$${firstCombo.price.toLocaleString('es-CO')}* ` +
          (secondCombo !== firstCombo ? `o ${secondCombo.label} en *$${secondCombo.price.toLocaleString('es-CO')}* ` : '') +
          `con Envío Gratis y pago en casa 🚚\n\n` +
          `¿Desea que le apartemos su pedido hoy?`
        );
      }

      const combosText = targetProduct.pricingCombos
        .map((c) => {
          const savings = c.savings ? ` (Ahorra $${c.savings.toLocaleString('es-CO')})` : '';
          return `🔹 ${c.label}: $${c.price.toLocaleString('es-CO')}${savings}`;
        })
        .join('\n');

      return (
        `¡Hola! Soy Maria Paula de MoraMerco 😊 Con gusto le comparto nuestras opciones para *${targetProduct.name}* con Envío Gratis y pago contra entrega en efectivo 🚚:\n\n` +
        `${combosText}\n\n` +
        `¿Cuál de las opciones le dejamos programada para despacho?`
      );
    }
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
}
