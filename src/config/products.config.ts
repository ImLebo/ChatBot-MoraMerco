import path from 'path';
import { ProductConfig } from '../domain/models/product.model.js';

/**
 * Catálogo centralizado de productos de MoraMerco.
 * Para agregar un nuevo producto, simplemente añade una nueva entrada con su ProductConfig
 * y coloca su fotografía correspondiente en la carpeta assets/.
 */
export const PRODUCTS_CATALOG: Record<string, ProductConfig> = {
  'luces-solar-10m': {
    id: 'luces-solar-10m',
    slug: 'luces-solar-10m',
    dropiId: '1931414',
    name: 'Luz Lineal Solar X 10m (100 LEDs Exterior)',
    trackingKeywords: [
      'luz lineal solar',
      'luces solares',
      'luz solar',
      'luces de navidad',
      'luces navidad',
      'guirnalda solar',
      'extension solar',
      'luces led solar',
      'luces exterior',
      'luces calidas',
      'luces blancas',
      '10 metros',
      '10m',
      '100 leds',
      'guirnalda',
      'luces led',
      'luces',
      'navidad',
      'solar',
      'panel solar',
      'bombillos led',
    ],
    primaryAssetPath: path.resolve(process.cwd(), 'assets/img_luz_solar/img_luz_solar_1.jpg'),
    pricingCombos: [
      {
        id: 'combo-1',
        label: 'Opción 1 Unidad (10 metros - 100 LEDs)',
        price: 54900,
      },
      {
        id: 'combo-2',
        label: 'Opción 2 Unidades (20 metros - COMBO ESTRELLA ⭐)',
        price: 79900,
        savings: 30000,
      },
      {
        id: 'combo-3',
        label: 'Opción 3 Unidades (30 metros - Mega Cobertura 🎄)',
        price: 109900,
        savings: 54800,
      },
    ],
    systemPromptContext: `
# ESPECIFICACIONES TÉCNICAS Y REGLAS DE LAS LUCES SOLARES (DROPI ID INTERNO: 1931414):
• NOMBRE Y FORMATO: Guirnalda / Extensión Lineal Solar LED Exterior (10 metros de longitud, 100 bombillos LED brillantes y duraderos).
• CERO CONSUMO ELÉCTRICO: Se recarga 100% con luz solar mediante su panel solar integrado y batería interna de litio recargable. No gasta un solo peso de energía.
• SENSOR INTELIGENTE AUTOMÁTICO: Se apaga automáticamente en el día para recargar y se enciende sola al anochecer.
• RESISTENCIA A LA INTEMPERIE: Certificación IP65 para exteriores. Es totalmente resistente a lluvias, sol intenso y humedad.
• TONOS DE LUZ DISPONIBLES: Luz Cálida (más recomendada y vendida para ambiente navideño/decorativo) y Luz Blanca.
• REGLA CRÍTICA DE TRANSPARENCIA: El ID de Dropi (1931414) es de USO INTERNO del sistema para logística. ¡ESTRICTAMENTE PROHIBIDO mencionárselo al cliente!

# ESTRATEGIA COMERCIAL Y ANCLAJE AL COMBO:
1. ANCLAJE AL COMBO ESTRELLA: Cuando el cliente pregunte precios, presenta siempre las 3 opciones, pero resalta visualmente el Combo de 2 unidades por $79.900. Explica que 10 metros suele ser justo para un espacio pequeño y que 20 metros garantiza cobertura completa en fachada, jardín o balcón con un gran ahorro de $30.000.
2. UPSELL SUAVE SI PIDEN 1 UNIDAD: Si el cliente dice que quiere solo 1 unidad, acéptalo con amabilidad pero haz este upsell suave antes de cerrar:
   "Claro que sí con mucho gusto te despacho 1 unidad por $54.900. Solo ten presente que por solo $25.000 adicionales te llevas la segunda (quedan las 2 en $79.900) y aseguras cubrir todo el espacio. ¿Prefieres aprovechar la promo de las 2 o dejamos solo la unidad individual? 😊"
3. MANEJO DE OBJECIONES:
   - "¿Y si llueve o está nublado?": "El panel cuenta con batería interna de litio que almacena energía incluso en días nublados o con lluvia suave, encendiendo normal durante la noche."
   - "¿Es confiable el pago?": "Totalmente, el pago lo realizas en efectivo directamente al repartidor de la transportadora cuando el paquete llegue a tus manos."
4. CIERRE Y RECOLECCIÓN DE DATOS: Solicita en un solo mensaje los datos de despacho:
   - Nombre completo
   - Número de teléfono celular
   - Dirección exacta (con barrio y detalles como torre/apto)
   - Ciudad y departamento
   - Tono de luz elegido (Cálida o Blanca) y cantidad de unidades.
`,
    followUpHooks: {
      firstFollowUp:
        `Hola, un saludo muy especial de parte de MoraMerco 😊✨\n\n` +
        `Paso a consultarte con el mayor agrado si te quedó alguna inquietud sobre nuestra *Extensión Solar LED de 10m* para exteriores.\n\n` +
        `Recuerda que tiene sensor automático de encendido al anochecer, cero consumo de luz y resiste lluvia. ¿Te gustaría en luz *Cálida* o *Blanca*? Quedo muy atenta para asesorarte 🙌`,
      secondFollowUp:
        `¡Hola de nuevo! Te saluda Maria Paula de MoraMerco 👋🎄\n\n` +
        `Nos encontramos organizando los despachos prioritarios del día junto a la transportadora 🚚📦\n\n` +
        `¿Deseas que alcancemos a programar tu entrega con el *Combo Estrella de 2 unidades por $79.900* con Envío Gratis y pago contra entrega en efectivo? ¡Quedan pocas unidades disponibles! ✨`,
    },
  },
};

/**
 * Producto predeterminado del sistema (Luces Solares 10m)
 */
export const DEFAULT_PRODUCT: ProductConfig = PRODUCTS_CATALOG['luces-solar-10m'];


/**
 * Obtiene un producto por su slug
 */
export function getProductBySlug(slug?: string): ProductConfig | undefined {
  if (!slug) return undefined;
  return PRODUCTS_CATALOG[slug];
}

/**
 * Obtiene la lista completa de productos configurados
 */
export function getAllProducts(): ProductConfig[] {
  return Object.values(PRODUCTS_CATALOG);
}

/**
 * Normaliza una cadena para comparación: minúsculas, sin tildes ni caracteres extra
 */
function normalizeForMatching(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Evalúa el texto entrante contra las palabras clave de rastreo (trackingKeywords)
 * de cada producto en el catálogo. Retorna el producto con la coincidencia más relevante.
 */
export function findProductByKeywords(rawText: string): ProductConfig | undefined {
  if (!rawText || !rawText.trim()) return undefined;

  const normalized = normalizeForMatching(rawText);

  // Ordenar productos dando prioridad a coincidencias de frases clave más largas
  let bestMatch: ProductConfig | undefined = undefined;
  let longestMatchLength = 0;

  for (const product of getAllProducts()) {
    for (const keyword of product.trackingKeywords) {
      const normKeyword = normalizeForMatching(keyword);
      if (!normKeyword) continue;

      // Coincidencia como subcadena exacta o límite de palabra
      const regex = new RegExp(`(^|\\s)${normKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`, 'i');
      if (regex.test(normalized) || normalized.includes(normKeyword)) {
        if (normKeyword.length > longestMatchLength) {
          longestMatchLength = normKeyword.length;
          bestMatch = product;
        }
      }
    }
  }

  return bestMatch;
}
