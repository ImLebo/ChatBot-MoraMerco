import path from 'path';
import { ProductConfig } from '../domain/models/product.model.js';

/**
 * Catálogo centralizado de productos de MoraMerco.
 * Para agregar un nuevo producto, simplemente añade una nueva entrada con su ProductConfig
 * y coloca su fotografía correspondiente en la carpeta assets/.
 */
export const PRODUCTS_CATALOG: Record<string, ProductConfig> = {
  'base-lavadora': {
    id: 'base-lavadora',
    slug: 'base-lavadora',
    name: 'Base Ajustable de Acero para Neveras y Lavadoras',
    trackingKeywords: [
      'base de lavadora',
      'base para lavadora',
      'base lavadora',
      'base de nevera',
      'base para nevera',
      'base nevera',
      'barras con ruedas',
      'barras para lavadora',
      'barras lavadora',
      'soporte para lavadora',
      'soporte lavadora',
      'soporte de lavadora',
      'soporte nevera',
      'soporte para nevera',
      'base ajustable',
      'barras de acero',
      'barras moviles',
      'barras telescopicas',
      'ruedas lavadora',
      'base con ruedas',
      'soporte con ruedas',
      'soporte',
      'bases',
      'base',
      'vaces',
      'vace',
    ],
    primaryAssetPath: path.resolve(process.cwd(), 'assets/fotobase.jpg'),
    pricingCombos: [
      {
        id: 'combo-1',
        label: 'Combo x1 (1 Par de Barras)',
        price: 69900,
      },
      {
        id: 'combo-2',
        label: 'Combo Dúo (x2 Pares - Nevera + Lavadora)',
        price: 119900,
        savings: 20000,
      },
      {
        id: 'combo-3',
        label: 'Combo Hogar Pack (x3 Pares)',
        price: 159900,
        savings: 50000,
      },
    ],
    systemPromptContext: `
# ESPECIFICACIONES TÉCNICAS Y REGLAS DE LA BASE AJUSTABLE:
• CONCEPTO Y ESTRUCTURA: Consta de un PAR DE BARRAS DE ACERO INDEPENDIENTES Y TELESCÓPICAS (DOS PIEZAS EN TOTAL).
  - Cada barra tiene almohadillas negras antideslizantes en los extremos y un sistema de 24 RUEDAS CON FRENOS INTEGRADOS (12 ruedas en cada barra, 24 ruedas en total por par).
• ⚠️ REGLA CRÍTICA DE DESCRIPCIÓN: ¡ESTRICTAMENTE PROHIBIDO utilizar términos que sugieran que son cuatro piezas o una plataforma cuadrada única fija! Son ÚNICAMENTE DOS BARRAS SEPARADAS TELESCÓPICAS (un par).
• FACILIDAD Y UNIVERSALIDAD: Cero ensamblaje complicado. No hay que armar marcos ni atornillar esquinas; solo se desliza una barra debajo de cada lateral del electrodoméstico y se ajusta a la medida en un dos por tres (45 cm a 70 cm de largo).
• ELEVACIÓN: Eleva el equipo exactamente 4 CM del suelo. Diseñada especialmente para trapear fácil debajo sin esfuerzo y evitar que la humedad o el agua estancada oxiden la lámina del electrodoméstico.
• RESISTENCIA Y CAPACIDAD: Fabricada en acero reforzado de alta resistencia. Soporta con total firmeza lavadoras pesadas de cualquier capacidad (15 a 45+ kg), neveras no-frost grandes y congeladores.
• ESTABILIDAD Y CENTRIFUGADO: Las 24 ruedas cuentan con frenos de bloqueo integrados y gomas antideslizantes. Al poner los frenos, la lavadora queda completamente fija, absorbe las vibraciones y no se mueve ni corre durante el centrifugado.
• ÁNGULOS DE MARKETING:
  1. Salud/Ergonomía: Evitar dolores de espalda al mover cosas pesadas para aseo ("sin matarse la espalda").
  2. Limpieza: Facilidad para trapear mugre y humedad ("trapear sabroso", "mover como una pluma").
  3. Protección: 4 cm de elevación previene óxido en electrodomésticos costosos.
`,
    followUpHooks: {
      firstFollowUp:
        `Estimado/a cliente, reciba un cordial saludo de parte de MoraMerco 😊\n\n` +
        `Le escribo con el mayor agrado para consultarle si le quedó alguna inquietud acerca de las medidas o el funcionamiento de la base para sus electrodomésticos.\n\n` +
        `Recuerde que al ser barras de acero independientes y telescópicas con 24 ruedas y frenos, se adaptan a cualquier nevera o lavadora sin esfuerzo ni herramientas, elevan 4 cm para trapear sabroso sin matarse la espalda y protegen sus equipos del óxido. Quedo muy atenta a sus indicaciones ✨`,
      secondFollowUp:
        `Buen día, le saluda nuevamente Maria Paula de MoraMerco 👋\n\n` +
        `Paso a comentarle respetuosamente que en nuestra bodega nos encontramos organizando los despachos del día junto a la transportadora 🚚📦\n\n` +
        `¿Desea que alcancemos a programar su entrega con el *Envío Gratis* y pago contra entrega en efectivo al recibir en su domicilio? Quedo muy atenta para dejársela lista de inmediato 🙌`,
    },
  },
};

/**
 * Producto predeterminado del sistema (Base Ajustable)
 */
export const DEFAULT_PRODUCT: ProductConfig = PRODUCTS_CATALOG['base-lavadora'];

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
