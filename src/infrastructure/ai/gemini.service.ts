import { GoogleGenAI } from '@google/genai';
import { IAiService } from '../../domain/services/ai-service.interface.js';
import { MORAMERCO_SYSTEM_PROMPT } from '../../domain/prompts/store-system.prompt.js';

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
    private readonly modelName: string = 'gemini-3.6-flash'
  ) {
    if (this.apiKey && this.apiKey.trim().length > 0) {
      this.ai = new GoogleGenAI({ apiKey: this.apiKey.trim() });
    }
  }

  public async generateResponse(
    senderId: string,
    userMessage: string,
    senderName?: string
  ): Promise<string> {
    // Si no se ha configurado la API Key, dar respuesta de contingencia
    if (!this.ai) {
      return (
        `¡Hola! Soy Maria Paula, bienvenido a MoraMerco 😊\n\n` +
        `📦 Manejamos Base Móvil para Nevera a $79.900 y Kit x2 a $139.900 con ENVÍO GRATIS y PAGO CONTRA ENTREGA en efectivo.\n\n` +
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
      const currentSystemInstruction = isOngoing
        ? `${MORAMERCO_SYSTEM_PROMPT}\n\n[INSTRUCCIÓN CRÍTICA]: Esta conversación YA ESTÁ EN CURSO. El cliente YA fue saludado y bienvenido. ¡ESTRICTAMENTE PROHIBIDO decir "¡Hola! Soy Maria Paula, bienvenido a MoraMerco" o volver a saludar! Responda directamente de forma ULTRA CONCISA (máximo 1 o 2 frases cortas).`
        : MORAMERCO_SYSTEM_PROMPT;

      // 4. Llamar a Gemini con el System Prompt oficial de MoraMerco (con modelo de respaldo si hay alta demanda)
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
        if (err?.status === 503 || err?.status === 429 || err?.status === 500) {
          const fallbackModel = 'gemini-3.5-flash';
          console.warn(`⚠️ Modelo ${this.modelName} saturado temporalmente (${err?.status}). Conmutando automáticamente a ${fallbackModel}...`);
          response = await this.ai.models.generateContent({
            model: fallbackModel,
            contents: limitedHistory,
            config: {
              systemInstruction: currentSystemInstruction,
              temperature: 0.5,
              maxOutputTokens: 500,
            },
          });
        } else {
          throw err;
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
      if (this.conversationHistory.get(senderId) && this.conversationHistory.get(senderId)!.length > 1) {
        return (
          'Con gusto le confirmo: 1 Base le queda en *$79.900* o el Kit x2 en *$139.900* con Envío Gratis y pago en casa 🚚\n\n' +
          '¿Desea que le apartemos 1 Base o prefiere el Kit x2?'
        );
      }
      return (
        '¡Hola! Soy Maria Paula, bienvenido a MoraMerco 😊 Con gusto le comparto nuestras opciones con Envío Gratis y pago contra entrega en efectivo 🚚:\n\n' +
        '🔹 1 Base: $79.900\n' +
        '🔥 KIT x2: $139.900 (Ahorra $19.900)\n\n' +
        '¿La busca para nevera, lavadora o desea el Kit x2?'
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
