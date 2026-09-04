import { config } from './config/env.config.js';
import { AuthStateService } from './infrastructure/whatsapp/auth-state.service.js';
import { QrService } from './infrastructure/whatsapp/qr.service.js';
import { BaileysSocketService } from './infrastructure/whatsapp/baileys-socket.service.js';
import { GeminiService } from './infrastructure/ai/gemini.service.js';
import { BotCoordinatorService } from './application/services/bot-coordinator.service.js';

async function bootstrap() {
  console.log('======================================================');
  console.log('🛍️ INICIANDO ASESORA VIRTUAL "MARIA PAULA" - MORAMERCO');
  console.log(`📁 Sesiones WhatsApp: ${config.sessionsDir}`);
  console.log(`🧠 Gemini API: ${config.geminiApiKey ? 'Configurada ✅' : 'No configurada (Modo contingencia) ⚠️'}`);
  console.log('======================================================');

  // 1. Capa de Infraestructura: Autenticación, QR y Gemini AI
  const authService = new AuthStateService(config.sessionsDir);
  const qrService = new QrService();
  const aiService = new GeminiService(config.geminiApiKey, config.geminiModel);

  // 2. Capa de Aplicación: Coordinador del Bot con IA inyectada
  const botCoordinator = new BotCoordinatorService(aiService);

  // 3. Capa de Infraestructura: Socket de Baileys
  const whatsappSocket = new BaileysSocketService(
    authService,
    qrService,
    botCoordinator
  );

  // 4. Iniciar la conexión WebSocket
  await whatsappSocket.connect();

  // Apagado controlado
  const shutdown = (signal: string) => {
    console.log(`\n🛑 Recibida señal ${signal}. Cerrando proceso de forma segura...`);
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

bootstrap().catch((error) => {
  console.error('❌ Error fatal al arrancar la aplicación:', error);
  process.exit(1);
});
