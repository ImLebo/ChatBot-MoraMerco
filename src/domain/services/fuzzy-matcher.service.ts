/**
 * Servicio de comparación difusa (Fuzzy Matching) y análisis fonético adaptado al español
 * y al lenguaje conversacional de WhatsApp en Colombia.
 * Permite reconocer intenciones, municipios, productos y preguntas incluso con mala ortografía,
 * omisión de tildes, intercambio de letras (b/v, c/s/z, k/qu/c, ll/y) o repetición de caracteres.
 */
export class FuzzyMatcherService {
  /**
   * Reduce letras repetidas consecutivas (ej: "hollaaaaa" -> "hola", "siii" -> "si", "cuannnto" -> "cuanto")
   * Preserva 'rr', 'll', 'cc' cuando es relevante.
   */
  public static cleanRepeatedChars(text: string): string {
    return text.replace(/(.)\1{2,}/gi, '$1');
  }

  /**
   * Normalización fonética simplificada en español para comparar palabras con ortografía dudosa:
   * - 'v' -> 'b'
   * - 'c' (ante e, i), 'z' -> 's'
   * - 'k', 'qu', 'c' (ante a, o, u) -> 'k'
   * - 'y' (como consonante o vocal), 'll' -> 'i'
   * - 'ge', 'gi' -> 'je', 'ji'
   * - 'h' muda eliminada
   * - Abreviaturas típicas: 'x' -> 'por', 'q'/'k' -> 'que', 'tb' -> 'tambien', 'd' -> 'de'
   */
  public static toPhonetic(text: string): string {
    let clean = text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Quitar tildes
      .replace(/[^\w\s]/g, ' ') // Quitar signos
      .trim();

    clean = this.cleanRepeatedChars(clean);

    // Expandir abreviaturas comunes de WhatsApp
    clean = clean
      .replace(/\bx\s*2\b/g, 'kitdos')
      .replace(/\bx\b/g, 'por')
      .replace(/\b(q|k)\b/g, 'que')
      .replace(/\b(xq|pq)\b/g, 'porque')
      .replace(/\b(qto|cto)\b/g, 'cuanto')
      .replace(/\bd\b/g, 'de')
      .replace(/\btbn?\b/g, 'tambien');

    // Transformaciones fonéticas
    let result = clean
      .replace(/v/g, 'b')
      .replace(/z/g, 's')
      .replace(/ce\b|ce(?=[ei])/g, 'se')
      .replace(/ci(?=[aeiou]?)/g, 'si')
      .replace(/qu(?=[ei])/g, 'k')
      .replace(/c(?=[aou])/g, 'k')
      .replace(/ll/g, 'i')
      .replace(/y(?=\s|$|[a-z])/g, 'i')
      .replace(/ge/g, 'je')
      .replace(/gi/g, 'ji')
      .replace(/h/g, '');

    return result.replace(/\s+/g, ' ').trim();
  }

  /**
   * Distancia de Levenshtein optimizada entre dos cadenas
   */
  public static levenshtein(a: string, b: string): number {
    const m = a.length;
    const n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;

    let prev = Array.from({ length: n + 1 }, (_, i) => i);
    let curr = new Array(n + 1).fill(0);

    for (let i = 1; i <= m; i++) {
      curr[0] = i;
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        curr[j] = Math.min(
          prev[j] + 1,       // Eliminación
          curr[j - 1] + 1,   // Inserción
          prev[j - 1] + cost // Sustitución
        );
      }
      [prev, curr] = [curr, prev];
    }

    return prev[n];
  }

  /**
   * Coeficiente de similitud entre 0.0 (totalmente diferente) y 1.0 (idéntico)
   */
  public static similarity(a: string, b: string): number {
    if (a === b) return 1.0;
    const maxLen = Math.max(a.length, b.length);
    if (maxLen === 0) return 1.0;
    const dist = this.levenshtein(a, b);
    return 1 - dist / maxLen;
  }

  /**
   * Compara dos palabras individuales con tolerancia fonética y ortográfica
   */
  public static fuzzyMatchWord(inputWord: string, targetWord: string, threshold: number = 0.80): boolean {
    const normInput = inputWord.toLowerCase().trim();
    const normTarget = targetWord.toLowerCase().trim();

    if (normInput === normTarget) return true;

    // Comparación fonética directa
    const phonInput = this.toPhonetic(normInput);
    const phonTarget = this.toPhonetic(normTarget);
    if (phonInput === phonTarget) return true;

    // Similitud de Levenshtein sobre forma original y fonética
    const origSim = this.similarity(normInput, normTarget);
    if (origSim >= threshold) return true;

    const phonSim = this.similarity(phonInput, phonTarget);
    if (phonSim >= threshold) return true;

    return false;
  }

  /**
   * Verifica si un texto contiene una palabra o frase objetivo con tolerancia a errores ortográficos.
   */
  public static fuzzyIncludes(text: string, phrase: string, threshold: number = 0.82): boolean {
    const normText = text.toLowerCase().trim();
    const normPhrase = phrase.toLowerCase().trim();

    // Coincidencia exacta o contenida directa
    if (normText.includes(normPhrase)) return true;

    // Coincidencia fonética directa
    const phonText = this.toPhonetic(normText);
    const phonPhrase = this.toPhonetic(normPhrase);
    if (phonText.includes(phonPhrase)) return true;

    // Si la frase es una sola palabra, buscar en los tokens del texto
    const targetWords = normPhrase.split(/\s+/).filter(Boolean);
    const textWords = normText.split(/\s+/).filter(Boolean);

    if (targetWords.length === 1) {
      const target = targetWords[0];
      return textWords.some((tw) => this.fuzzyMatchWord(tw, target, threshold));
    }

    // Si es una frase de varias palabras:
    for (let i = 0; i <= textWords.length - targetWords.length; i++) {
      let allMatch = true;
      for (let j = 0; j < targetWords.length; j++) {
        if (!this.fuzzyMatchWord(textWords[i + j], targetWords[j], threshold)) {
          allMatch = false;
          break;
        }
      }
      if (allMatch) return true;
    }

    return false;
  }

  /**
   * Verifica si un texto coincide con cualquiera de los patrones dados de forma difusa
   */
  public static fuzzyMatchAny(text: string, patterns: string[], threshold: number = 0.82): boolean {
    return patterns.some((p) => this.fuzzyIncludes(text, p, threshold));
  }

  /**
   * Encuentra el mejor candidato coincidente en una lista
   */
  public static findBestMatch(input: string, candidates: string[], threshold: number = 0.80): string | undefined {
    let bestCandidate: string | undefined;
    let highestSim = 0;

    const phonInput = this.toPhonetic(input);

    for (const cand of candidates) {
      if (input.toLowerCase() === cand.toLowerCase()) return cand;
      const phonCand = this.toPhonetic(cand);
      if (phonInput === phonCand) return cand;

      const sim = Math.max(
        this.similarity(input.toLowerCase(), cand.toLowerCase()),
        this.similarity(phonInput, phonCand)
      );

      if (sim > highestSim && sim >= threshold) {
        highestSim = sim;
        bestCandidate = cand;
      }
    }

    return bestCandidate;
  }

  // =========================================================================
  // DETECCIÓN DE PREGUNTAS Y DUDAS ACTIVAS EN EL MENSAJE
  // =========================================================================

  /**
   * Determina si el mensaje contiene alguna pregunta o duda pendiente
   */
  public static hasQuestionOrDoubt(rawText: string): boolean {
    // 1. Signos explícitos de interrogación
    if (rawText.includes('?') || rawText.includes('¿')) return true;

    const norm = rawText.toLowerCase();
    const phon = this.toPhonetic(rawText);

    // 2. Interrogativos o patrones de duda directa
    const doubtKeywords = [
      'cuanto', 'cuamto', 'qto', 'cto', 'kuanto', 'cuanta', 'cuantos', 'cuantas',
      'cuesta', 'kuesta', 'custa', 'costo', 'costaria', 'valor', 'precio', 'presio',
      'vale', 'valen', 'sale', 'salen', 'a como', 'a cuanto', 'que vale', 'que cuesta',
      'como es eso', 'como es', 'que es', 'como asi', 'de que trata', 'que incluye',
      'que trae', 'trae', 'vienen', 'vienen las dos', 'son estrellas', 'tienen forma de',
      'en forma de', 'chorritos', 'cascada', 'arbol', 'para arbol', 'balcon', 'para balcon',
      'resiste lluvia', 'llueve', 'impermeable', 'si llueve', 'si esta nublado', 'panel solar',
      'como funciona', 'se prende sola', 'como carga',
      'nequi', 'daviplata', 'bancolombia', 'como se paga', 'como pago', 'metodo de pago',
      'puedo pagar', 'se puede pagar', 'pago contraentrega', 'garantia', 'es seguro', 'confiable',
      'cuanto demora', 'cuanto tarda', 'cuando llega', 'tiempo de entrega',
      'medidas', 'dimensiones', 'cuanto mide', 'tamano', 'longitud', 'largo',
      'donde estan', 'de donde son', 'tienen tienda', 'local fisico',
      'sera que', 'una pregunta', 'tengo una duda', 'otra pregunta', 'una inquietud',
      'me gustaria verlas', 'quiero verlas', 'ver las luces', 'fotos'
    ];

    const phonTokens = phon.split(/\s+/);

    return doubtKeywords.some((kw) => {
      if (kw.includes(' ')) {
        return norm.includes(kw) || phon.includes(this.toPhonetic(kw));
      }

      const regex = new RegExp(`\\b${kw}\\b`, 'i');
      if (regex.test(norm)) return true;

      const pkw = this.toPhonetic(kw);
      return phonTokens.includes(pkw);
    });
  }

  /**
   * Clasifica el tipo específico de duda para responderla de forma inmediata y precisa
   */
  public static detectDoubtTopic(
    rawText: string
  ): 'SHAPE_AND_PLACEMENT' | 'STAR_CONFUSION' | 'COMPATIBILITY_WEATHER' | 'KIT_PRICE' | 'PAYMENT' | 'SHIPPING' | 'WARRANTY' | 'MEASUREMENTS' | 'INSTALLATION' | 'OFFICE_DELIVERY' | 'OTHER' {
    const norm = rawText.toLowerCase();

    // Duda sobre estrellas o confusión de "Combo Estrella" ("como es eso", "son estrellas", "combo de estrellas")
    if (
      /\b(estrellas?|combo\s*de\s*estrellas?)\b/i.test(norm) &&
      (/\b(como\s*es|que\s*es|son|tienen\s*forma|figura|como\s*asi|de\s*que)\b/i.test(norm) || norm.includes('como es eso'))
    ) {
      return 'STAR_CONFUSION';
    }

    // Duda de formato: chorritos, cascada, árbol, balcón
    if (
      /\b(chorritos?|cascada|cortina|lluvia\s*de\s*luces|arbol|balcon|para\s*el\s*arbol|en\s*el\s*arbol|para\s*el\s*balcon)\b/i.test(norm)
    ) {
      return 'SHAPE_AND_PLACEMENT';
    }

    // Duda de resistencia a la lluvia / clima / sol / impermeable
    if (
      /\b(llueve|lluvia|lluvias|nublado|impermeable|resiste\s*agua|intemperie|se\s*moja|ip65|sol\s*intenso)\b/i.test(norm)
    ) {
      return 'COMPATIBILITY_WEATHER';
    }

    // Duda de precios o combos ("cuanto vale el combo", "cuanto cuestan las 2")
    if (
      (/\b(cuesta|costo|vale|valen|precio|presio|valor|cuanto|qto|cto)\b/i.test(norm) &&
      /\b(el\s*x|x2|kit|combo|las\s*2|las\s*dos|ambas|cada\s*una|ambos|duo)\b/i.test(norm)) ||
      norm.includes('cuanto vale el combo') || norm.includes('cuanto valen las 2')
    ) {
      return 'KIT_PRICE';
    }

    // Duda de medios de pago (Nequi, Bancolombia, contraentrega)
    if (/\b(nequi|bancolombia|daviplata|transferencia|tarjeta|como se paga|como pago|medio de pago|formas de pago)\b/i.test(norm)) {
      return 'PAYMENT';
    }

    // Duda de tiempo de envío / entrega
    if (/\b(cuanto demora|cuanto tarda|cuando llega|cuantos dias|tiempo de entrega|cuando me llega)\b/i.test(norm)) {
      return 'SHIPPING';
    }

    // Duda de garantía o seguridad (anti-estafa)
    if (/\b(garantia|garantilla|es seguro|confiable|estafa|abrir antes|revisar antes|destapar)\b/i.test(norm)) {
      return 'WARRANTY';
    }

    // Duda de medidas o dimensiones
    if (/\b(medidas|dimensiones|cuanto mide|tamano|altura|alto|longitud|largo|metros)\b/i.test(norm)) {
      return 'MEASUREMENTS';
    }

    // Duda de instalación, panel solar o cómo funciona
    if (/\b(como se arma|como se instala|como funciona|panel solar|se prende sola|recargable|sin cables)\b/i.test(norm)) {
      return 'INSTALLATION';
    }

    // Duda de entrega / reclamo en oficina
    if (/\b(oficina|ofisina|reclamo en oficina|recoger en oficina|agencia|sucursal)\b/i.test(norm)) {
      return 'OFFICE_DELIVERY';
    }

    return 'OTHER';
  }

  /**
   * Genera una respuesta inmediata, cálida y precisa a una duda o pregunta detectada
   */
  public static getDoubtAnswer(
    topic: 'SHAPE_AND_PLACEMENT' | 'STAR_CONFUSION' | 'COMPATIBILITY_WEATHER' | 'KIT_PRICE' | 'PAYMENT' | 'SHIPPING' | 'WARRANTY' | 'MEASUREMENTS' | 'INSTALLATION' | 'OFFICE_DELIVERY' | 'OTHER'
  ): string {
    switch (topic) {
      case 'STAR_CONFUSION':
        return '¡Con mucho gusto te aclaro! 😊 No tienen forma de figuras de estrellas, son bombillitos LED tipo guirnalda lineal de 10 metros (100 LEDs por extensión) con panel solar recargable. Le llamamos Combo Dúo porque incluye 2 extensiones completas (20 metros y 200 LEDs) con $30.000 de ahorro ✨🎄';
      case 'SHAPE_AND_PLACEMENT':
        return '¡Hola! Te cuento con todo gusto: son extensiones de guirnalda lineal (10 metros con 100 LEDs cada una). ✨ Para el balcón y barandas son perfectas porque las puedes bordear o enrollar fácilmente. 🎄 Para el árbol de Navidad quedan hermosas porque las vas envolviendo entre las ramas y no necesitan cables a la pared. No son chorritos o cascadas colgantes verticales, sino cable lineal súper flexible y resistente a la lluvia 🌧️💡';
      case 'COMPATIBILITY_WEATHER':
        return '¡Totalmente resistentes! Cuentan con certificación IP65 impermeable para intemperie, soportando lluvia intensa y sol. Su panel con batería interna de litio almacena energía incluso en días nublados para encenderse sola toda la noche 🌧️☀️';
      case 'KIT_PRICE':
        return 'Con mucho gusto te confirmo: el *Combo Dúo x2 Unidades (20 metros)* te sale en *$79.900* con Envío Gratis y pago contra entrega (ahorras $30.000). Si prefieres 1 unidad (10 metros) te queda en *$54.900* o 3 unidades (30m) en *$109.900* 🎄✨';
      case 'PAYMENT':
        return 'El pago es 100% contra entrega en efectivo al recibir su paquete en casa o en oficina de Interrapidísimo 💵 (Muchos repartidores también permiten transferencia Nequi o Bancolombia en el momento de la entrega) 👍';
      case 'SHIPPING':
        return 'El envío es totalmente *GRATIS* a toda Colombia 🚚📦 Despachamos hoy mismo y el paquete suele tardar de 2 a 4 días hábiles mediante Interrapidísimo o Coordinadora.';
      case 'WARRANTY':
        return 'Tiene total tranquilidad: cuenta con garantía directa de 30 días de fábrica y soporte posventa con nosotros. Además, no arriesga su dinero porque abona seguro en efectivo solo al recibir en sus manos 🛡️📦';
      case 'MEASUREMENTS':
        return 'Cada extensión tiene 10 metros de longitud y 100 bombillos LED brillantes. Con el Combo Dúo de 2 unidades cubres 20 metros (200 bombillos) ideal para fachadas, balcones o jardines 📐✨';
      case 'INSTALLATION':
        return '¡Súper fácil y sin cables a la corriente! Solo ubicas el panel solar donde reciba luz del día y extiendes la guirnalda de luces. Se prende automáticamente al anochecer y se apaga de día sola 💡☀️';
      case 'OFFICE_DELIVERY':
        return '¡Claro que sí! Con mucho gusto se lo despachamos para *Reclamo en Oficina de Interrapidísimo* en su municipio. El envío sigue siendo Gratis y cancela en efectivo en la misma oficina al retirar 🏢📦';
      case 'OTHER':
      default:
        return 'Con mucho gusto te colaboro con cualquier inquietud sobre nuestras luces solares navideñas 😊';
    }
  }

  /**
   * Detecta si el cliente está indeciso entre varios colores o pregunta si se pueden combinar
   */
  public static isIndecisiveOrCombineTones(rawText: string): boolean {
    const text = rawText
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();

    return (
      /\b(indecis[oa]|no\s*se\s*si|cual\s*me\s*recomiendas?|cual\s*se\s*ve\s*mas|cual\s*es\s*mejor|se\s*pueden\s*combinar|puedo\s*combinar|una\s*y\s*una|una\s*de\s*cada|vienen\s*combinadas|puedo\s*pedir\s*una\s*de\s*cada|cual\s*queda\s*mas|entre\s*calida|entre\s*blanca|entre\s*multicolor|combinar|combinadas)\b/i.test(text) ||
      (/\b(calida|amarilla)\b/i.test(text) && /\b(multicolor|colores|blanca)\b/i.test(text) && /\b(o|cual|pero|recomiendas|bonita|mejor)\b/i.test(text))
    );
  }

  /**
   * Extrae la combinación personalizada de tonos cuando el cliente pide varias unidades con distintos colores
   * Ej: "2 cálidas y 1 multicolor", "una cálida y una blanca"
   */
  public static extractCombinedTones(rawText: string): string | null {
    const text = rawText
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();

    // Patrones específicos de cantidades por tono
    // Ej: "2 calidas y 1 multicolor", "una calida y una multicolor", "1 blanca y 1 calida"
    if (/\b(2|dos)\s*(calidas?|amarillas?)\b/i.test(text) && /\b(1|una)\s*(multicolor|colorida|de\s*colores)\b/i.test(text)) {
      return '2 Cálidas + 1 Multicolor';
    }
    if (/\b(1|una)\s*(calidas?|amarillas?)\b/i.test(text) && /\b(2|dos)\s*(multicolor|colorida|de\s*colores)\b/i.test(text)) {
      return '1 Cálida + 2 Multicolor';
    }
    if (/\b(2|dos)\s*(calidas?|amarillas?)\b/i.test(text) && /\b(1|una)\s*(blancas?)\b/i.test(text)) {
      return '2 Cálidas + 1 Blanca';
    }
    if (/\b(1|una)\s*(calidas?|amarillas?)\b/i.test(text) && /\b(2|dos)\s*(blancas?)\b/i.test(text)) {
      return '1 Cálida + 2 Blancas';
    }
    if (/\b(una|1)\s*(calida|amarilla)\b/i.test(text) && /\b(una|1)\s*(multicolor|de\s*colores)\b/i.test(text)) {
      return '1 Cálida + 1 Multicolor';
    }
    if (/\b(una|1)\s*(calida|amarilla)\b/i.test(text) && /\b(una|1)\s*(blanca)\b/i.test(text)) {
      return '1 Cálida + 1 Blanca';
    }
    if (/\b(una|1)\s*(blanca)\b/i.test(text) && /\b(una|1)\s*(multicolor)\b/i.test(text)) {
      return '1 Blanca + 1 Multicolor';
    }
    if (/\b(combinadas?|mitad\s*y\s*mitad|una\s*y\s*una)\b/i.test(text)) {
      return 'Tonos combinados a elección';
    }

    return null;
  }

  /**
   * Detecta si el cliente está respondiendo o seleccionando un tono de luz
   */
  public static detectToneChoice(rawText: string): 'Cálida' | 'Blanca' | 'Multicolor' | null {
    // Si está indeciso o preguntando si puede combinar, NO forzar una elección solitaria
    if (this.isIndecisiveOrCombineTones(rawText)) {
      return null;
    }

    const text = rawText
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w\s]/g, ' ')
      .trim();

    // 1. Multicolor (de colores, navideña, colorida)
    if (
      /\b(multicolor|multi\s*color|de\s*colores|colores|colorida|navidena|navidad|tercera|la\s*3|la\s*tercera|opcion\s*3)\b/i.test(text) &&
      !/\b(que\s*colores|cuales\s*colores|tienen\s*colores)\b/i.test(text)
    ) {
      return 'Multicolor';
    }

    // 2. Cálida (amarilla, dorada, primera, calidad - autocorrect común)
    if (
      /\b(calida|calido|luz\s*calida|amarilla|dorada|calidad|primera|la\s*1|la\s*primera|opcion\s*1|la\s*mas\s*recomendada)\b/i.test(text) &&
      !/\b(que\s*tonos|cuales\s*tonos|tienen\s*calida)\b/i.test(text)
    ) {
      return 'Cálida';
    }

    // 3. Blanca (fria, clara, segunda)
    if (
      /\b(blanca|blanco|luz\s*blanca|fria|luz\s*fria|segunda|la\s*2|la\s*segunda|opcion\s*2)\b/i.test(text) &&
      !/\b(que\s*tonos|cuales\s*tonos|tienen\s*blanca)\b/i.test(text)
    ) {
      return 'Blanca';
    }

    return null;
  }
}
