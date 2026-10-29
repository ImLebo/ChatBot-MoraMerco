import { QuickReplyService } from '../domain/services/quick-reply.service.js';
import { DEFAULT_PRODUCT } from '../config/products.config.js';

console.log('========================================================================');
console.log('🧪 PRUEBAS: CLIENTE INDECISO ENTRE COLORES -> COMPRA 2 -> CAMBIA A 3 -> ENVÍA DATOS');
console.log('========================================================================\n');

const qr = new QuickReplyService();
const jid = 'cliente_indeciso_3159998888@s.whatsapp.net';

let passed = 0;
let total = 0;

function assert(condition: boolean, testName: string, actualOutput?: string) {
  total++;
  if (condition) {
    passed++;
    console.log(`✅ [PASÓ] ${testName}`);
  } else {
    console.error(`❌ [FALLÓ] ${testName}`);
    if (actualOutput) {
      console.error(`   Output obtenido:\n   "${actualOutput.slice(0, 180)}..."\n`);
    }
  }
}

// -----------------------------------------------------------------------------
// PASO 1: Cliente indeciso entre varios colores
// "Estoy indeciso entre cálida y multicolor, ¿cuál se ve más bonita para la fachada?"
// -----------------------------------------------------------------------------
const step1 = qr.matchQuickReply(
  'Estoy indeciso entre calida y multicolor, cual se ve mas bonita para la fachada?',
  jid,
  DEFAULT_PRODUCT
);
if (step1.nextState) qr.setState(jid, step1.nextState);

assert(
  step1.matched &&
  step1.intent === 'TONES_INDECISIVE_OR_COMBINE' &&
  step1.response!.includes('Cálida') &&
  step1.response!.includes('Multicolor') &&
  step1.response!.includes('combinar') &&
  step1.response!.includes('Combo Dúo'),
  'Paso 1: Asesora con calidez al cliente indeciso y le aclara que sí puede combinar tonos',
  step1.response
);

// -----------------------------------------------------------------------------
// PASO 2: Cliente consulta si puede pedir una y una (combinadas)
// "¿Se pueden pedir combinadas, una cálida y una multicolor?"
// -----------------------------------------------------------------------------
const step2 = qr.matchQuickReply(
  'Se pueden pedir combinadas, una calida y una multicolor?',
  jid,
  DEFAULT_PRODUCT
);
if (step2.nextState) qr.setState(jid, step2.nextState);

assert(
  step2.matched &&
  step2.intent === 'TONES_INDECISIVE_OR_COMBINE' &&
  step2.response!.includes('combinar'),
  'Paso 2: Confirma que en los combos se pueden pedir combinadas a gusto',
  step2.response
);

// -----------------------------------------------------------------------------
// PASO 3: Cliente decide comprar 2 unidades
// "Listo, voy a comprar 2"
// -----------------------------------------------------------------------------
const step3 = qr.matchQuickReply(
  'Listo, voy a comprar 2 unidades',
  jid,
  DEFAULT_PRODUCT
);
if (step3.nextState) qr.setState(jid, step3.nextState);

assert(
  step3.matched &&
  step3.intent === 'COMBO_SELECTED_REQUEST_DATA' &&
  step3.response!.toLowerCase().includes('combo dúo') || step3.response!.toLowerCase().includes('combo duo') &&
  step3.response!.includes('$79.900') &&
  step3.response!.includes('Nombre completo'),
  'Paso 3: Registra Combo Dúo (2 unidades) por $79.900 y solicita datos de despacho',
  step3.response
);

// -----------------------------------------------------------------------------
// PASO 4: Cliente cambia de opinión y decide comprar 3 unidades
// "Sabes qué, mejor voy a comprar 3 para que me rinda más"
// -----------------------------------------------------------------------------
const step4 = qr.matchQuickReply(
  'Sabes que, mejor voy a comprar 3 unidades para que me rinda mas',
  jid,
  DEFAULT_PRODUCT
);
if (step4.nextState) qr.setState(jid, step4.nextState);

assert(
  step4.matched &&
  step4.intent === 'COMBO_SELECTED_REQUEST_DATA' &&
  step4.response!.includes('3 Unidades') &&
  step4.response!.includes('$109.900') &&
  step4.response!.includes('Nombre completo'),
  'Paso 4: Actualiza el pedido al combo de 3 unidades ($109.900) sin perder el hilo',
  step4.response
);

// -----------------------------------------------------------------------------
// PASO 5: Cliente envía datos completos de despacho especificando los tonos combinados
// "Mi nombre es Andrés Pérez celular 3109876543 carrera 8 # 12-40 barrio Centro Duitama Boyacá, 2 cálidas y 1 multicolor"
// -----------------------------------------------------------------------------
const step5 = qr.matchQuickReply(
  'Mi nombre es Andres Perez celular 3109876543 carrera 8 # 12-40 barrio Centro Duitama Boyaca, 2 calidas y 1 multicolor',
  jid,
  DEFAULT_PRODUCT
);
if (step5.nextState) qr.setState(jid, step5.nextState);

assert(
  step5.matched &&
  step5.intent === 'DATA_RECEIVED' &&
  step5.response!.includes('Andres Perez') &&
  step5.response!.includes('3109876543') &&
  step5.response!.includes('Duitama') &&
  step5.response!.includes('2 Cálidas + 1 Multicolor') &&
  step5.response!.includes('3 Unidades') &&
  step5.response!.includes('CONFIRMAR'),
  'Paso 5: Valida datos de envío, detecta combinación de colores (2 Cálidas + 1 Multicolor) y genera resumen de compra',
  step5.response
);

// -----------------------------------------------------------------------------
// PASO 6: Cliente confirma el pedido
// "CONFIRMAR"
// -----------------------------------------------------------------------------
const step6 = qr.matchQuickReply('CONFIRMAR', jid, DEFAULT_PRODUCT);
if (step6.nextState) qr.setState(jid, step6.nextState);

assert(
  step6.matched &&
  step6.intent === 'CONFIRM_ORDER' &&
  step6.response!.includes('100% CONFIRMADO') &&
  step6.response!.includes('Duitama'),
  'Paso 6: Pedido queda 100% confirmado para despacho hacia Duitama',
  step6.response
);

// -----------------------------------------------------------------------------
// VARIACIÓN B: Cliente cambia de combo DESPUÉS de haber mandado los datos
// (Ejemplo: mandó datos para 2 unidades, y luego dice "cámbiame a 3")
// -----------------------------------------------------------------------------
console.log('\n--- VARIACIÓN B: CAMBIO DE COMBO CON DATOS YA REGISTRADOS ---');
const jidB = 'cliente_variacion_b_3001112233@s.whatsapp.net';

// 1. Cliente pide 2
const b1 = qr.matchQuickReply('Quiero 2 unidades', jidB, DEFAULT_PRODUCT);
if (b1.nextState) qr.setState(jidB, b1.nextState);

// 2. Cliente manda datos para 2 unidades
const b2 = qr.matchQuickReply(
  'Laura Restrepo celular 3001112233 Calle 50 # 30-15 barrio Laureles Medellin Antioquia tono calida',
  jidB,
  DEFAULT_PRODUCT
);
if (b2.nextState) qr.setState(jidB, b2.nextState);

assert(
  b2.matched && b2.intent === 'DATA_RECEIVED',
  'Variación B: Datos iniciales guardados para 2 unidades',
  `Intent: ${b2.intent} | Response: ${b2.response}`
);

// 3. Cliente cambia de opinión antes de confirmar: "Sabes qué, cámbiame a 3 unidades"
const b3 = qr.matchQuickReply('Sabes que, cambiame a 3 unidades mejor', jidB, DEFAULT_PRODUCT);
if (b3.nextState) qr.setState(jidB, b3.nextState);

assert(
  b3.matched &&
  b3.intent === 'COMBO_CHANGE_UPDATED' &&
  b3.response!.includes('RESUMEN ACTUALIZADO') &&
  b3.response!.includes('3 Unidades') &&
  b3.response!.includes('Laura Restrepo') &&
  !b3.response!.includes('Por favor facilítanos en un solo mensaje:'),
  'Variación B: Actualiza el pedido a 3 unidades SIN volver a pedir dirección/cédula/nombre',
  b3.response
);

const b4 = qr.matchQuickReply('CONFIRMAR', jidB, DEFAULT_PRODUCT);
assert(
  b4.matched && b4.intent === 'CONFIRM_ORDER',
  'Variación B: Confirmación exitosa del pedido modificado a 3 unidades'
);

console.log('\n========================================================================');
console.log(`📊 RESULTADO FINAL: ${passed} / ${total} pruebas pasadas (${Math.round((passed / total) * 100)}%)`);
console.log('========================================================================\n');

if (passed === total) {
  process.exit(0);
} else {
  process.exit(1);
}
