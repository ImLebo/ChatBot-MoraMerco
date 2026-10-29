import { QuickReplyService } from '../domain/services/quick-reply.service.js';
import { FuzzyMatcherService } from '../domain/services/fuzzy-matcher.service.js';
import { PRODUCTS_CATALOG, DEFAULT_PRODUCT } from '../config/products.config.js';

console.log('================================================================');
console.log('🧪 SUITE DE PRUEBAS DEL ÁRBOL DE DECISIÓN Y MEJORAS DE CHATS');
console.log('================================================================\n');

const qr = new QuickReplyService();
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
      console.error(`   Output obtenido:\n   "${actualOutput.slice(0, 150)}..."\n`);
    }
  }
}

// -----------------------------------------------------------------------------
// CASO 1: Chat 1 - Pregunta de precio ("Q precio tienen")
// Debe ofrecer Combo Dúo (NO Combo Estrella) y no generar reprocesos
// -----------------------------------------------------------------------------
const chat1Jid = 'test_chat_1@s.whatsapp.net';
const res1 = qr.matchQuickReply('Q precio tienen', chat1Jid, DEFAULT_PRODUCT);
assert(
  res1.matched &&
  res1.response!.includes('Combo Dúo') &&
  !res1.response!.includes('COMBO ESTRELLA') &&
  res1.response!.includes('$79.900'),
  'Prueba 1: "Q precio tienen" devuelve precios con "Combo Dúo" y $79.900 (sin Combo Estrella)',
  res1.response
);

// -----------------------------------------------------------------------------
// CASO 2: Chat 2 - Multi-intención Tono + Precio ("¿Qué tonos de luz tienen disponibles? Que presio tienen")
// Debe responder con los 3 tonos Y los precios en un solo mensaje fluido
// -----------------------------------------------------------------------------
const chat2Jid = 'test_chat_2@s.whatsapp.net';
const res2 = qr.matchQuickReply('¿Qué tonos de luz tienen disponibles? Que presio tienen', chat2Jid, DEFAULT_PRODUCT);
assert(
  res2.matched &&
  res2.intent === 'TONES_AND_PRICES_COMBINED' &&
  res2.response!.includes('Luz Cálida') &&
  res2.response!.includes('Luz Blanca') &&
  res2.response!.includes('Multicolor') &&
  res2.response!.includes('$54.900') &&
  res2.response!.includes('$79.900'),
  'Prueba 2: "¿Qué tonos tienen? Que presio tienen" responde con 3 tonos Y lista de precios combinada',
  res2.response
);

// -----------------------------------------------------------------------------
// CASO 3: Chat 2 & 6 - Selección de tono ("luz cálida la más recomendada" / "Luz calida")
// ¡NO DEBE REPETIR "¿Cuál de los dos tonos te gusta más?"! (Rompe bucle)
// -----------------------------------------------------------------------------
const res3 = qr.matchQuickReply('luz cálida la más recomendada', chat2Jid, DEFAULT_PRODUCT);
assert(
  res3.matched &&
  res3.intent === 'TONE_CHOSEN_PRESENT_COMBOS' &&
  res3.response!.includes('Cálida') &&
  !res3.response!.includes('Tenemos disponibles los 2 tonos') &&
  !res3.response!.includes('Tenemos disponibles los 3 tonos') &&
  res3.response!.includes('Combo Dúo'),
  'Prueba 3: "luz cálida la más recomendada" registra tono cálida y presenta combos SIN bucle',
  res3.response
);

// -----------------------------------------------------------------------------
// CASO 4: Chat 4 - Autocorrector de tono "Calidad" (en lugar de Cálida)
// Debe reconocer "Calidad" como Luz Cálida y no reiniciar la pregunta
// -----------------------------------------------------------------------------
const chat4Jid = 'test_chat_4@s.whatsapp.net';
const res4 = qr.matchQuickReply('Calidad', chat4Jid, DEFAULT_PRODUCT);
assert(
  res4.matched &&
  res4.intent === 'TONE_CHOSEN_PRESENT_COMBOS' &&
  res4.response!.includes('Cálida'),
  'Prueba 4: "Calidad" (autocorrector de Cálida) es reconocido como elección de Luz Cálida',
  res4.response
);

// -----------------------------------------------------------------------------
// CASO 5: Chat 3 - Duda de estrellas ("El combo de estrellas de 2 unidades como es eso")
// NO debe asumir compra ni pedir cédula/dirección; debe aclarar que son guirnaldas
// -----------------------------------------------------------------------------
const chat3Jid = 'test_chat_3@s.whatsapp.net';
const res5 = qr.matchQuickReply('El combo de estrellas de 2 unidades como es eso', chat3Jid, DEFAULT_PRODUCT);
assert(
  res5.matched &&
  res5.intent === 'EXPLAIN_COMBO_DUO_NOT_STARS' &&
  res5.response!.includes('No tienen forma de estrellas') &&
  !res5.response!.includes('Nombre completo') &&
  !res5.response!.includes('Dirección exacta'),
  'Prueba 5: "El combo de estrellas de 2 unidades como es eso" aclara formato y NO pide datos de envío',
  res5.response
);

// -----------------------------------------------------------------------------
// CASO 6: Chat 4 - Duda de chorritos y árbol ("Tienes en forma de chorritos para colocar en el balcón y para árbol")
// Debe explicar que son guirnaldas lineales, ideales para balcón y árbol
// -----------------------------------------------------------------------------
const res6 = qr.matchQuickReply('Tienes en forma de chorritos para colocar en el balcón y para árbol', chat4Jid, DEFAULT_PRODUCT);
assert(
  res6.matched &&
  res6.intent === 'SHAPE_AND_PLACEMENT_FAQ' &&
  res6.response!.includes('árbol') &&
  res6.response!.includes('balcón') &&
  (res6.response!.includes('no son tipo cortina o chorritos') || res6.response!.includes('chorritos')),
  'Prueba 6: Pregunta de chorritos, árbol y balcón es respondida con claridad técnica y calidez',
  res6.response
);

// -----------------------------------------------------------------------------
// CASO 7: Chat 4 - Solicitud de fotos ("Me gustaría verlas" / "Quiero ver las luces")
// Debe enviar la foto del producto con descripción humana
// -----------------------------------------------------------------------------
const res7 = qr.matchQuickReply('Me gustaría verlas', chat4Jid, DEFAULT_PRODUCT);
assert(
  res7.matched &&
  res7.intent === 'SEND_PHOTO' &&
  Boolean(res7.mediaPath),
  'Prueba 7: "Me gustaría verlas" activa el envío de fotos con mediaPath asignado',
  res7.response
);

// -----------------------------------------------------------------------------
// CASO 8: Chat 5 - Selección de Luz Blanca ("Blanca")
// Debe confirmar el tono Blanco y no enviar mensajes repetidos
// -----------------------------------------------------------------------------
const chat5Jid = 'test_chat_5@s.whatsapp.net';
const res8 = qr.matchQuickReply('Blanca', chat5Jid, DEFAULT_PRODUCT);
assert(
  res8.matched &&
  res8.intent === 'TONE_CHOSEN_PRESENT_COMBOS' &&
  res8.response!.includes('Blanca') &&
  !res8.response!.includes('Tenemos disponibles'),
  'Prueba 8: "Blanca" registra luz blanca sin bucle de preguntas',
  res8.response
);

// -----------------------------------------------------------------------------
// CASO 9: Nuevo tono - Selección de Multicolor ("multicolor", "de colores")
// Debe soportar el tono Multicolor perfectamente
// -----------------------------------------------------------------------------
const chat6Jid = 'test_chat_6@s.whatsapp.net';
const res9 = qr.matchQuickReply('la quiero en multicolor de colores', chat6Jid, DEFAULT_PRODUCT);
assert(
  res9.matched &&
  res9.intent === 'TONE_CHOSEN_PRESENT_COMBOS' &&
  res9.response!.includes('Multicolor'),
  'Prueba 9: Tono Multicolor es detectado y celebrado correctamente',
  res9.response
);

// -----------------------------------------------------------------------------
// CASO 10: Selección de Combo Dúo ("Quiero el combo duo de 79900")
// Debe solicitar datos de envío con calidez
// -----------------------------------------------------------------------------
const res10 = qr.matchQuickReply('Quiero el combo duo de 79900', chat6Jid, DEFAULT_PRODUCT);
if (res10.nextState) {
  qr.setState(chat6Jid, res10.nextState);
}
assert(
  res10.matched &&
  res10.intent === 'COMBO_SELECTED_REQUEST_DATA' &&
  res10.response!.includes('Nombre completo') &&
  res10.response!.includes('Dirección exacta') &&
  res10.response!.toLowerCase().includes('combo duo') || res10.response!.toLowerCase().includes('combo dúo'),
  'Prueba 10: Selección de Combo Dúo solicita datos de envío de forma organizada',
  res10.response
);

// -----------------------------------------------------------------------------
// CASO 11: Envío de datos completos y Confirmación
// -----------------------------------------------------------------------------
const res11 = qr.matchQuickReply(
  'Mi nombre es Carlos Gomez celular 3124567890 Cra 15 # 45-20 barrio La Pradera Tunja Boyaca luz multicolor',
  chat6Jid,
  DEFAULT_PRODUCT
);
if (res11.nextState) {
  qr.setState(chat6Jid, res11.nextState);
}
assert(
  res11.matched &&
  res11.intent === 'DATA_RECEIVED' &&
  res11.response!.includes('Carlos Gomez') &&
  res11.response!.includes('Tunja') &&
  res11.response!.includes('CONFIRMAR'),
  'Prueba 11: Datos de envío completos validados con botón CONFIRMAR',
  res11.response
);

const res12 = qr.matchQuickReply('CONFIRMAR', chat6Jid, DEFAULT_PRODUCT);
assert(
  res12.matched &&
  res12.intent === 'CONFIRM_ORDER' &&
  res12.response!.includes('100% CONFIRMADO'),
  'Prueba 12: Confirmación final cierra el pedido 100% con éxito',
  res12.response
);

console.log('\n================================================================');
console.log(`📊 RESULTADO FINAL: ${passed} / ${total} pruebas pasadas (${Math.round((passed / total) * 100)}%)`);
console.log('================================================================\n');

if (passed === total) {
  process.exit(0);
} else {
  process.exit(1);
}
