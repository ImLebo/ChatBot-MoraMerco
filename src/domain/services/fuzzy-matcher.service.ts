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

    // Comparación fonética directa (ej: "vaces" vs "bases", "labadora" vs "lavadora")
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

    // Si es una frase de varias palabras (ej: "nevera y lavadora" o "cuanto vale"):
    // Buscar ventana deslizante de palabras en el texto
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
   * Encuentra el mejor candidato coincidente en una lista (por ejemplo para ciudades o transportadoras)
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
   * Determina si el mensaje contiene alguna pregunta o duda pendiente,
   * ya sea de forma explícita (con '?') o implícita mediante palabras de consulta
   * y mala ortografía común en Colombia.
   */
  public static hasQuestionOrDoubt(rawText: string): boolean {
    // 1. Signos explícitos de interrogación
    if (rawText.includes('?') || rawText.includes('¿')) return true;

    const norm = rawText.toLowerCase();
    const phon = this.toPhonetic(rawText);

    // 2. Interrogativos o patrones de duda directa (incluyendo ortografía popular)
    const doubtKeywords = [
      'cuanto', 'cuamto', 'qto', 'cto', 'kuanto', 'cuanta', 'cuantos', 'cuantas',
      'cuesta', 'kuesta', 'custa', 'costo', 'costaria', 'valor', 'precio', 'presio',
      'vale', 'valen', 'sale', 'salen', 'a como', 'a cuanto', 'que vale', 'que cuesta',
      'si le sirve', 'le sirve', 'si sirve', 'sirve', 'cirve', 'sirve a', 'sirve para',
      'aguanta', 'soporta', 'resiste', 'aguanta el', 'soporta el', 'kilos', 'kilo', 'kg',
      'centrifugado', 'centrifujado', 'sentrifugado', 'vibra', 'vibracion', 'se mueve',
      'se corre', 'tiembla', 'freno', 'frenos',
      'como se arma', 'como se instala', 'como viene', 'dificil de armar',
      'nequi', 'daviplata', 'bancolombia', 'como se paga', 'como pago', 'metodo de pago',
      'puedo pagar', 'se puede pagar', 'pago contraentrega', 'abrir antes', 'revisar antes',
      'destapar antes', 'garantia', 'garantilla', 'es seguro', 'confiable', 'estafa',
      'cuanto demora', 'cuanto tarda', 'cuando llega', 'tiempo de entrega',
      'medidas', 'dimensiones', 'cuanto mide', 'tamano', 'altura', 'alto', 'del piso',
      'donde estan', 'de donde son', 'tienen tienda', 'local fisico',
      'sera que', 'una pregunta', 'tengo una duda', 'otra pregunta', 'una inquietud',
      'el kit trae', 'trae las dos', 'vienen las dos', 'es cada una'
    ];

    const phonTokens = phon.split(/\s+/);

    return doubtKeywords.some((kw) => {
      // Si la palabra clave es una frase compuesta con espacios
      if (kw.includes(' ')) {
        return norm.includes(kw) || phon.includes(this.toPhonetic(kw));
      }

      // Si es una sola palabra, verificar con límite de palabra (\b) para evitar falsos positivos
      // (ej. "Manizales" no debe activar "sale", "tranquilo" no debe activar "kilo")
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
  ): 'COMPATIBILITY_WEIGHT' | 'KIT_PRICE' | 'PAYMENT' | 'SHIPPING' | 'WARRANTY' | 'MEASUREMENTS' | 'INSTALLATION' | 'OFFICE_DELIVERY' | 'OTHER' {
    const norm = rawText.toLowerCase();
    const phon = this.toPhonetic(rawText);

    // Duda de compatibilidad, lavadora, kilos, vibración o centrifugado
    if (
      /\b(40\s*kilos?|40k|kilos?|kg|peso|centrifugad[oa]|vibra|vibracion|se mueve|se corre|frenos?|soporta|aguanta|sirve|sirbe)\b/i.test(norm) ||
      phon.includes('centrifujado') || phon.includes('sentrifugado') || phon.includes('sirbe') || phon.includes('kilos')
    ) {
      return 'COMPATIBILITY_WEIGHT';
    }

    // Duda de precios o kits ("i el x q cuesta", "cuanto valen las 2 vaces", "el kit trae las 2")
    if (
      (/\b(cuesta|costo|vale|valen|precio|presio|valor|cuanto|qto|cto)\b/i.test(norm) &&
      /\b(el\s*x|x2|kit|las\s*2|las\s*dos|bases|vaces|ambas|cada\s*una|ambos)\b/i.test(norm)) ||
      norm.includes('el x q cuesta') || norm.includes('las 2 vaces') || norm.includes('trae las dos')
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
    if (/\b(medidas|dimensiones|cuanto mide|tamano|altura|alto|del piso|del suelo)\b/i.test(norm)) {
      return 'MEASUREMENTS';
    }

    // Duda de instalación o armado
    if (/\b(como se arma|como se instala|armado|instalacion|dificil de armar|herramientas|facil de armar)\b/i.test(norm)) {
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
    topic: 'COMPATIBILITY_WEIGHT' | 'KIT_PRICE' | 'PAYMENT' | 'SHIPPING' | 'WARRANTY' | 'MEASUREMENTS' | 'INSTALLATION' | 'OFFICE_DELIVERY' | 'OTHER'
  ): string {
    switch (topic) {
      case 'COMPATIBILITY_WEIGHT':
        return '¡Con total seguridad le confirmo! Nuestra Base Ajustable consta de dos barras de acero independientes con 24 ruedas con freno integrado y almohadillas antideslizantes. Soportan electrodomésticos pesados de sobra y al bloquear los frenos evitan que la lavadora se mueva o vibre al centrifugar 🛠️🔒';
      case 'KIT_PRICE':
        return 'Con mucho gusto le confirmo: el *Combo Dúo x2* (2 pares de barras para Nevera + Lavadora) le sale en *$119.900* con Envío Gratis a toda Colombia y pago contra entrega en efectivo (ahorra $20.000). Si prefiere el Combo x1 (1 Par para 1 equipo) le queda en *$69.900* 🚚✨';
      case 'PAYMENT':
        return 'El pago es 100% contra entrega en efectivo al recibir su paquete en casa o en oficina de Interrapidísimo 💵 (Muchos repartidores también permiten transferencia Nequi o Bancolombia en el momento de la entrega) 👍';
      case 'SHIPPING':
        return 'El envío es totalmente *GRATIS* a toda Colombia 🚚📦 Despachamos hoy mismo y el paquete suele tardar de 2 a 4 días hábiles mediante Interrapidísimo o Coordinadora.';
      case 'WARRANTY':
        return 'Tiene total tranquilidad: cuenta con garantía directa de 30 días de fábrica y soporte posventa con nosotros. Además, no arriesga su dinero porque abona seguro en efectivo solo al recibir en sus manos 🛡️📦';
      case 'MEASUREMENTS':
        return 'Son dos barras de acero independientes y telescópicas, ajustables de 45 a 70 cm de largo, con una elevación de 4 cm del suelo. Ideales para trapear fácil sin matarse la espalda y proteger sus equipos del óxido causado por agua estancada 📐✨';
      case 'INSTALLATION':
        return '¡Cero complicaciones y sin herramientas! Al ser dos barras independientes (no una plataforma cuadrada que toque armar), solo ubica una a cada lado bajo su nevera o lavadora, ajusta el largo telescópico y listo en un dos por tres 🛠️✨';
      case 'OFFICE_DELIVERY':
        return '¡Claro que sí! Con mucho gusto se lo despachamos para *Reclamo en Oficina de Interrapidísimo* en su municipio. El envío sigue siendo Gratis y cancela en efectivo en la misma oficina al retirar 🏢📦';
      case 'OTHER':
      default:
        return 'Con mucho gusto resolveremos cualquier consulta adicional sobre sus bases de barras ajustables 😊';
    }
  }
}
