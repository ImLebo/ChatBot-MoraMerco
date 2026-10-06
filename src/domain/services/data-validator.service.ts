import { FuzzyMatcherService } from './fuzzy-matcher.service.js';

export interface CustomerShippingData {
  isValid: boolean;
  name?: string;
  city?: string;
  department?: string;
  neighborhood?: string;
  address?: string;
  phone?: string;
  isOfficeDelivery?: boolean;
  officeName?: string;
  missingFields: string[];
  feedbackMessage?: string;
  hasPendingDoubt?: boolean;
  doubtTopic?: 'COMPATIBILITY_WEIGHT' | 'KIT_PRICE' | 'PAYMENT' | 'SHIPPING' | 'WARRANTY' | 'MEASUREMENTS' | 'INSTALLATION' | 'OFFICE_DELIVERY' | 'OTHER';
  doubtAnswer?: string;
}

export class DataValidatorService {
  /**
   * Departamentos oficiales de Colombia
   */
  public static readonly COLOMBIAN_DEPARTMENTS = [
    'amazonas', 'antioquia', 'arauca', 'atlantico', 'bolivar', 'boyaca',
    'caldas', 'caqueta', 'casanare', 'cauca', 'cesar', 'choco', 'cordoba',
    'cundinamarca', 'guainia', 'guaviare', 'huila', 'la guajira', 'guajira',
    'magdalena', 'meta', 'narino', 'norte de santander', 'putumayo', 'quindio',
    'risaralda', 'san andres', 'santander', 'sucre', 'tolima', 'valle del cauca',
    'valle', 'vaupes', 'vichada', 'bogota'
  ];

  /**
   * Principales ciudades y municipios de Colombia con alta cobertura de transportadoras
   */
  public static readonly COLOMBIAN_CITIES = [
    // Principales capitales
    'bogota', 'medellin', 'cali', 'barranquilla', 'cartagena', 'bucaramanga',
    'pereira', 'manizales', 'santa marta', 'ibague', 'cucuta', 'pasto',
    'neiva', 'villavicencio', 'armenia', 'valledupar', 'monteria', 'sincelejo',
    'popayan', 'tunja', 'riohacha', 'florencia', 'quibdo', 'yopal', 'mocoa',
    'san andres', 'leticia', 'arauca', 'mitu', 'puerto carreno', 'inirida',
    // Santander
    'suaita', 'socorro', 'san gil', 'barbosa', 'velez', 'charala', 'sabana de torres',
    'cimitarra', 'malaga', 'lebrija', 'zapatoca', 'oiba', 'mogotes', 'puente nacional',
    'barichara', 'curiti', 'aratoca', 'villanueva', 'guavata', 'simacota', 'landazuri',
    'el playon', 'rionegro', 'betulia', 'san vicente de chucuri', 'puerto wilches',
    'floridablanca', 'giron', 'piedecuesta', 'barrancabermeja',
    // Cundinamarca y alrededores
    'soacha', 'chia', 'zipaquira', 'facatativa', 'mosquera', 'madrid', 'funza',
    'fusagasuga', 'girardot', 'cajica', 'cota', 'sopo', 'tocancipa', 'la calera',
    'tabio', 'tenjo', 'sibate', 'ubate', 'villeta', 'pacho', 'silvania', 'la mesa',
    'tocaima', 'guaduas', 'caqueza', 'sesquile', 'gachancipa', 'anapoima', 'el rosal',
    'subachoque', 'la vega', 'choachi', 'arbelaez',
    // Antioquia
    'bello', 'itagui', 'envigado', 'rionegro', 'sabaneta', 'la estrella', 'apartado',
    'turbo', 'marinilla', 'guarne', 'el carmen de viboral', 'copacabana', 'caldas',
    'caucasia', 'santa fe de antioquia', 'yarumal', 'andes', 'ciudad bolivar',
    'sonson', 'la ceja', 'el retiro', 'girardota', 'chigorodo', 'carepa', 'santa rosa de osos',
    'amaga', 'fredonia', 'urrao', 'segovia', 'remedios',
    // Boyacá
    'duitama', 'sogamoso', 'chiquinquira', 'paipa', 'moniquira', 'puerto boyaca',
    'garagoa', 'villa de leyva', 'guateque', 'nobsa', 'samaca', 'soata', 'tibasosa',
    'santa rosa de viterbo', 'chita', 'belen', 'ramiriqui', 'turmeque',
    // Valle del Cauca
    'palmira', 'buenaventura', 'tulua', 'cartago', 'buga', 'jamundi', 'yumbo',
    'candelaria', 'florida', 'pradera', 'sevilla', 'zarzal', 'roldanillo', 'caicedonia',
    'guacari', 'ginebra', 'darien', 'la union', 'bugalagrande', 'el cerrito',
    // Atlántico y Bolívar
    'soledad', 'malambo', 'sabanalarga', 'baranoa', 'galapa', 'puerto colombia',
    'palmar de varela', 'santo tomas', 'sabanagrande', 'magangue', 'turbaco', 'arjona',
    'el carmen de bolivar', 'san juan nepomuceno', 'santa rosa del sur', 'mompox', 'san jacinto',
    // Tolima y Huila
    'espinal', 'melgar', 'chaparral', 'honda', 'mariquita', 'libano', 'flandes',
    'guamo', 'purificacion', 'fresno', 'lerida', 'pitalito', 'garzon', 'la plata',
    'campoalegre', 'gigante', 'rivera', 'palermo', 'san agustin', 'timana', 'algeciras',
    // Nariño y Cauca
    'ipiales', 'tumaco', 'tuquerres', 'samaniego', 'la union', 'sandona', 'chachagui',
    'santander de quilichao', 'puerto tejada', 'patia', 'piendamo', 'miranda', 'corinto',
    // Cesar y Córdoba
    'aguachica', 'codazzi', 'bosconia', 'curumani', 'la jagua de ibirico', 'chiriguana',
    'el copey', 'san alberto', 'cerete', 'sahagun', 'montelibano', 'lorica', 'planeta rica',
    'tierralta', 'cienaga de oro', 'san pelayo', 'chinu',
    // Magdalena y La Guajira
    'cienaga', 'fundacion', 'el banco', 'plato', 'aracataca', 'pivijay',
    'maicao', 'uribia', 'manaure', 'fonseca', 'san juan del cesar', 'barrancas',
    // Meta y Casanare
    'acacias', 'granada', 'puerto lopez', 'puerto gaitan', 'san martin', 'cumaral',
    'aguazul', 'villanueva', 'tauramena', 'monterrey', 'paz de ariporo',
    // Norte de Santander
    'ocana', 'pamplona', 'villa del rosario', 'los patios', 'tibu', 'chinacota', 'el zulia',
    // Risaralda, Caldas, Quindío
    'dosquebradas', 'santa rosa de cabal', 'la virginia', 'belen de umbria',
    'la dorada', 'chinchina', 'villamaria', 'riosucio', 'anserma', 'salamina', 'supia',
    'calarca', 'montenegro', 'quimbaya', 'la tebaida', 'circasia', 'filandia', 'salento',
    // Sucre, Caquetá, Putumayo, Chocó
    'corozal', 'san marcos', 'san onofre', 'sampues', 'tolu', 'covenas',
    'san vicente del caguan', 'cartagena del chaira', 'puerto rico',
    'puerto asis', 'orito', 'valle del guamuez', 'villagarzon', 'istmina', 'condoto'
  ];

  /**
   * Mapeo de capitales de Colombia a su departamento oficial
   */
  public static readonly CAPITAL_DEPARTMENTS: Record<string, string> = {
    bogota: 'Cundinamarca',
    medellin: 'Antioquia',
    cali: 'Valle del Cauca',
    barranquilla: 'Atlántico',
    cartagena: 'Bolívar',
    bucaramanga: 'Santander',
    pereira: 'Risaralda',
    manizales: 'Caldas',
    ibague: 'Tolima',
    cucuta: 'Norte de Santander',
    pasto: 'Nariño',
    neiva: 'Huila',
    villavicencio: 'Meta',
    armenia: 'Quindío',
    valledupar: 'Cesar',
    monteria: 'Córdoba',
    sincelejo: 'Sucre',
    popayan: 'Cauca',
    tunja: 'Boyacá',
    riohacha: 'La Guajira',
    florencia: 'Caquetá',
    quibdo: 'Chocó',
    yopal: 'Casanare',
    mocoa: 'Putumayo',
    arauca: 'Arauca',
    leticia: 'Amazonas',
  };

  /**
   * Palabras clave que identifican entrega en oficinas de transportadoras
   * o nombres de las transportadoras oficiales
   */
  private static readonly OFFICE_TRANSPORTADORA_KEYWORDS = [
    'interrapidisimo', 'enterrapidicimo', 'interapidisimo', 'inter rapidisimo',
    'inter-rapidisimo', 'inter', 'rapidisimo', 'servientrega', 'coordinadora',
    'envia', 'tcc', 'deprisa', 'veloces', 'reclamo en oficina', 'recoger en oficina',
    'entrega en oficina', 'reclamo oficina', 'oficina principal', 'oficina transportadora',
    'agencia interrapidisimo', 'sucursal interrapidisimo', 'oficina servientrega',
    'oficina coordinadora', 'oficina envia', 'oficina'
  ];

  /**
   * Palabras que NUNCA deben interpretarse como nombres de personas
   */
  public static readonly BLACKLISTED_NAME_WORDS = new Set([
    // Transportadoras y logística
    'interrapidisimo', 'enterrapidicimo', 'interapidisimo', 'inter rapidisimo',
    'inter-rapidisimo', 'inter', 'rapidisimo', 'servientrega', 'coordinadora',
    'envia', 'tcc', 'deprisa', 'veloces', 'oficina', 'sucursal', 'agencia',
    'bodega', 'reclamo', 'recoger', 'entrega', 'entregar', 'despacho', 'despachar',
    'envio', 'enviar', 'mandar', 'mande', 'mandeme', 'envieme', 'llega', 'llegar',

    // Vías y nomenclatura de direcciones
    'calle', 'carrera', 'cra', 'cll', 'cr', 'cl', 'diagonal', 'diag', 'dg',
    'transversal', 'transv', 'tv', 'avenida', 'av', 'barrio', 'casa', 'apto',
    'apartamento', 'manzana', 'mz', 'lote', 'km', 'kilometro', 'vereda', 'finca',
    'autopista', 'callejon', 'pasaje', 'sector', 'etapa', 'bloque', 'torre', 'piso',
    'interior', 'int',

    // Teléfono y contacto
    'selular', 'celular', 'tel', 'telefono', 'contacto', 'whatsapp', 'numero',

    // Saludos, cortesía y despedidas
    'hola', 'buenas', 'buenos', 'tardes', 'dias', 'noches', 'gracias', 'favor',
    'porfa', 'porfavor', 'amable', 'muchas', 'mil', 'cordial', 'saludos', 'feliz',

    // Artículos y pronombres en español
    'el', 'la', 'los', 'las', 'un', 'una', 'uno', 'unos', 'unas',
    'yo', 'tu', 'usted', 'ustedes', 'ella', 'ellos', 'ellas',
    'me', 'te', 'se', 'nos', 'le', 'les', 'lo', 'mi', 'mis', 'su', 'sus',

    // Preposiciones y conjunciones
    'a', 'al', 'ante', 'bajo', 'cabe', 'con', 'contra', 'de', 'del', 'desde',
    'durante', 'en', 'entre', 'hacia', 'hasta', 'mediante', 'para', 'por',
    'segun', 'sin', 'so', 'sobre', 'tras', 'versus', 'via',
    'y', 'e', 'ni', 'o', 'u', 'i', 'que', 'q', 'k', 'pero', 'sino', 'aunque',
    'porque', 'ya', 'si',

    // Verbos comunes de consulta, compra y acción
    'cuesta', 'cuestan', 'costo', 'costos', 'costaria', 'costar', 'vale', 'valen',
    'sale', 'salen', 'tiene', 'tienen', 'tendra', 'hay', 'habria', 'es', 'son',
    'era', 'ser', 'estar', 'esta', 'estan', 'repito', 'repetir', 'digo', 'dice',
    'decir', 'pregunto', 'pregunta', 'preguntas', 'duda', 'dudas', 'saber',
    'entiendo', 'hacer', 'hace', 'pago', 'pagar', 'paga', 'cancela', 'cancelar',
    'sirve', 'servir', 'aguanta', 'aguantar', 'soporta', 'soportar', 'pesa', 'pesar',
    'quiero', 'deseo', 'necesito', 'busca', 'busco', 'mandame', 'envieme', 'regaleme',
    'dame', 'deme', 'dar', 'pase', 'paseme', 'pasar', 'ver', 'mirar', 'mostrar',
    'muestreme', 'compartir', 'compartame', 'trae', 'traer', 'vienen', 'viene',
    'funciona', 'oxida', 'vibra', 'vibrar', 'mover', 'mueve', 'frena', 'armar',
    'instalar', 'quedo', 'queda', 'quedan', 'puede', 'pueden',

    // Palabras comerciales y productos
    'pedido', 'base', 'bases', 'barra', 'barras', 'par', 'pares', 'nevera', 'lavadora', 'secadora', 'estufa',
    'kit', 'combo', 'promo', 'promocion', 'unidad', 'unidades', 'precio', 'precios',
    'valor', 'cuanto', 'cuanta', 'cuantos', 'cuantas', 'como', 'cuando', 'donde',
    'cual', 'cuales', 'quien', 'quienes', 'ambos', 'ambas', 'solo', 'solamente',
    'nequi', 'bancolombia', 'daviplata', 'efectivo', 'contraentrega', 'pesos',
    'cop', 'dinero', 'plata', 'transferencia', 'tarjeta', 'cuota', 'cuotas',

    // Características técnicas y consultas
    'foto', 'fotos', 'fotp', 'fotico', 'foticos', 'imagen', 'imagenes', 'video',
    'videos', 'catalogo', 'medida', 'medidas', 'tamano', 'alto', 'altura', 'ancho',
    'largo', 'dimension', 'dimensiones', 'kilo', 'kilos', 'kg', 'libra', 'libras',
    'peso', 'acero', 'metal', 'metalica', 'plastico', 'rueda', 'ruedas', 'freno',
    'frenos', 'centrifugado', 'centrifugar', 'garantia', 'seguro', 'seguridad',
    'confiable', 'estafa', 'calidad', 'original', 'resiste', 'resistente',

    // Respuestas cortas o estados
    'si', 'no', 'ok', 'listo', 'dale', 'bueno', 'bien', 'mal', 'malo', 'mejor',
    'peor', 'claro', 'correcto', 'perfecto', 'excelente', 'caro', 'barato',
    'rebaja', 'descuento', 'pensar', 'pensarlo', 'afan', 'luego', 'ahora',
    'despues', 'espera', 'cambio', 'cambiar'
  ]);

  /**
   * Textos vagos que no constituyen una dirección válida
   */
  private static readonly INVALID_ADDRESS_PATTERNS = [
    /^mi casa$/i,
    /^casa$/i,
    /^en mi casa$/i,
    /^aqui$/i,
    /^mi apto$/i,
    /^mi trabajo$/i,
    /^donde vivo$/i,
    /^la misma$/i,
  ];

  /**
   * Normaliza texto para comparaciones (sin tildes, en minúsculas)
   */
  public static normalize(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w\s#\-]/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Determina de manera estricta si un mensaje contiene datos de envío reales
   * (celular, dirección con números, oficina de transportadora o formulario multilínea)
   */
  public static isLikelyShippingData(rawText: string): boolean {
    const norm = this.normalize(rawText);
    const lines = rawText.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);

    // 1. Detectar celular colombiano válido (10 dígitos empezando por 3 o formato con 57, o typo p/o al final)
    const phoneCleaned = rawText.replace(/[^\d]/g, ' ');
    const phoneCandidates = phoneCleaned.split(/\s+/).filter((num) => num.length >= 7);
    const rawTokens = rawText.split(/\s+/);
    const hasPhone =
      phoneCandidates.some(
        (c) => (c.length === 10 && c.startsWith('3')) || (c.length === 12 && c.startsWith('573'))
      ) || rawTokens.some((t) => /^3\d{8}[poPOlLiI]$/.test(t));

    // 2. Detectar vía o nomenclatura con número (incluyendo variantes fonéticas colombianas como caye, krra, etc.)
    const hasRoadWithNumber =
      /(?:calle|caye|carrera|karrera|cra|crra|krra|kra|cll|clle|cr|cl|diagonal|diag|dg|transversal|transv|tv|avenida|av|autopista)\s*#?\s*\d+/i.test(norm) ||
      /(?:manzana|mz)\s*[a-zA-Z0-9]+\s*(?:casa|lote)?\s*\d*/i.test(norm) ||
      /(?:vereda|finca)\s+[a-zA-Z]+/i.test(norm);

    // 3. Detectar mención de entrega o reclamo en oficina de transportadora
    const isOffice = this.OFFICE_TRANSPORTADORA_KEYWORDS.some((kw) =>
      new RegExp(`\\b${kw}\\b`, 'i').test(norm)
    );
    const hasOfficeDelivery = isOffice;

    // Detectar si menciona alguna ciudad o departamento colombiano
    const mentionsCity =
      this.COLOMBIAN_CITIES.some((c) => new RegExp(`\\b${c}\\b`, 'i').test(norm)) ||
      this.COLOMBIAN_DEPARTMENTS.some((d) => new RegExp(`\\b${d}\\b`, 'i').test(norm));

    // 4. Si el mensaje contiene una duda u objeción explícita:
    const isDoubtOrObjection =
      FuzzyMatcherService.hasQuestionOrDoubt(rawText) ||
      /\b(muy caro|caro|pensar|pensarlo|ya no quiero|no gracias|luego aviso)\b/i.test(norm);

    if (isDoubtOrObjection) {
      // Solo admitir si simultáneamente contiene celular y (dirección con número, oficina o ciudad)
      if (!(hasPhone && (hasRoadWithNumber || hasOfficeDelivery || mentionsCity))) {
        return false;
      }
    }

    if (hasPhone) return true;
    if (hasRoadWithNumber) return true;
    if (hasOfficeDelivery) return true;

    // 5. Si contiene etiquetas explícitas de formulario de envío
    if (/(?:nombre|recibe|destinatario|ciudad|municipio|direccion|celular|telefono)\s*:/i.test(rawText)) {
      return true;
    }

    // 6. Si es un mensaje multilínea (>= 2 líneas) y alguna línea menciona una ciudad o departamento colombiano
    if (lines.length >= 2) {
      if (mentionsCity) return true;
    }

    return false;
  }

  /**
   * Valida la coherencia de los datos de envío proporcionados por el cliente,
   * permitiendo fusionar información acumulada en turnos previos.
   */
  public static validate(rawText: string, previousData?: CustomerShippingData): CustomerShippingData {
    const lines = rawText.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
    const normalizedFull = this.normalize(rawText);
    const missing: string[] = [];

    // =========================================================================
    // 0. DETECCIÓN DE PREGUNTA O DUDA ADICIONAL EN EL MENSAJE
    // =========================================================================
    const hasPendingDoubt = FuzzyMatcherService.hasQuestionOrDoubt(rawText);
    const doubtTopic = hasPendingDoubt ? FuzzyMatcherService.detectDoubtTopic(rawText) : undefined;
    const doubtAnswer = doubtTopic ? FuzzyMatcherService.getDoubtAnswer(doubtTopic) : undefined;

    // =========================================================================
    // 1. VALIDACIÓN DE TELÉFONO CELULAR (CON CORRECCIÓN DE ERRORES TIPOGRÁFICOS)
    // =========================================================================
    let foundPhone: string | undefined = previousData?.phone;
    let hasMalformedPhone = false;

    // A. Detectar error común de teclado: 9 dígitos + 'p'/'o' al final (la tecla 'p' o 'o' está junto al '0' en teclados móviles)
    const rawTokens = rawText.split(/\s+/);
    for (const token of rawTokens) {
      if (/^3\d{8}[poPOlLiI]$/.test(token)) {
        foundPhone = token.slice(0, 9) + '0';
        break;
      }
    }

    if (!foundPhone) {
      // B. Detectar números con letras intercaladas (ej: 30065t11324)
      const malformedRegex = /\b\d{3,}[a-zA-Z]+\d*\b|\b[a-zA-Z]+\d{5,}\b/;
      if (malformedRegex.test(rawText)) {
        hasMalformedPhone = true;
      }

      // C. Buscar celular colombiano estándar de 10 dígitos (inicia por 3)
      const phoneCleaned = rawText.replace(/[^\d]/g, ' ');
      const phoneCandidates = phoneCleaned.split(/\s+/).filter((num) => num.length >= 7);

      for (const cand of phoneCandidates) {
        if (cand.startsWith('57') && cand.length === 12 && cand[2] === '3') {
          foundPhone = cand.substring(2);
          break;
        }
        if (cand.length === 10 && cand.startsWith('3')) {
          foundPhone = cand;
          break;
        }
      }
    }

    if (!foundPhone) {
      if (hasMalformedPhone) {
        missing.push('*Celular:* Me confirma su número de 10 dígitos correcto (el enviado contiene letras)');
      } else {
        missing.push('*Número de celular:* Celular de 10 dígitos para la transportadora (ej: 3001234567)');
      }
    }

    // =========================================================================
    // 2. VALIDACIÓN DE CIUDAD O MUNICIPIO (Y DEPARTAMENTO)
    // =========================================================================
    let foundCity: string | undefined = previousData?.city;
    let foundDepartment: string | undefined = previousData?.department;

    // A. Búsqueda prioritaria en diccionario de ciudades y municipios reconocidos
    for (const city of this.COLOMBIAN_CITIES) {
      const regex = new RegExp(`\\b${city}\\b`, 'i');
      if (regex.test(normalizedFull)) {
        foundCity = this.capitalizeWords(city);
        // Verificar si también menciona departamento
        for (const dept of this.COLOMBIAN_DEPARTMENTS) {
          if (new RegExp(`\\b${dept}\\b`, 'i').test(normalizedFull) && dept !== city) {
            foundDepartment = this.capitalizeWords(dept);
            foundCity = `${foundCity}, ${foundDepartment}`;
            break;
          }
        }
        // Si no mencionó departamento pero es una capital mapeada (ej. Manizales -> Caldas)
        if (!foundDepartment && this.CAPITAL_DEPARTMENTS[city]) {
          foundDepartment = this.CAPITAL_DEPARTMENTS[city];
          foundCity = `${foundCity}, ${foundDepartment}`;
        }
        break;
      }
    }

    // B. Detección por patrón dinámico: "[Municipio] [Departamento]" (si no estaba en la lista fija)
    if (!foundCity) {
      const deptRegex = new RegExp(
        `\\b([a-zA-ZñáéíóúÁÉÍÓÚ]{3,})\\s+(${this.COLOMBIAN_DEPARTMENTS.join('|')})\\b`,
        'i'
      );
      const deptMatch = normalizedFull.match(deptRegex);
      if (deptMatch && deptMatch[1] && deptMatch[2]) {
        const candMuni = deptMatch[1].trim();
        const candDept = deptMatch[2].trim();
        if (!this.OFFICE_TRANSPORTADORA_KEYWORDS.includes(candMuni) && !['calle', 'carrera', 'cra', 'cll', 'barrio', 'casa', 'apto'].includes(candMuni)) {
          foundCity = `${this.capitalizeWords(candMuni)}, ${this.capitalizeWords(candDept)}`;
          foundDepartment = this.capitalizeWords(candDept);
        }
      }
    }

    // C. Búsqueda difusa para municipios con mala ortografía (ej: "vogota", "bukaramanga", "medelljin", "suayta")
    if (!foundCity) {
      const tokens = normalizedFull.split(/\s+/).filter((t) => t.length >= 3);
      for (const token of tokens) {
        if (token.length < 4) continue;
        // Evitar comparar vías y stopwords
        if (this.BLACKLISTED_NAME_WORDS.has(token) || ['calle', 'carrera', 'cra', 'barrio'].includes(token)) continue;

        const bestCityMatch = FuzzyMatcherService.findBestMatch(token, this.COLOMBIAN_CITIES, 0.80);
        if (bestCityMatch) {
          foundCity = this.capitalizeWords(bestCityMatch);
          for (const dept of this.COLOMBIAN_DEPARTMENTS) {
            if (new RegExp(`\\b${dept}\\b`, 'i').test(normalizedFull) && dept !== bestCityMatch) {
              foundDepartment = this.capitalizeWords(dept);
              foundCity = `${foundCity}, ${foundDepartment}`;
              break;
            }
          }
          break;
        }
      }

      // Probar bigramas para municipios compuestos (ej: "san jil" -> "san gil", "valle dupar" -> "valledupar")
      if (!foundCity && tokens.length >= 2) {
        for (let i = 0; i < tokens.length - 1; i++) {
          const bigram = `${tokens[i]} ${tokens[i + 1]}`;
          const fused = `${tokens[i]}${tokens[i + 1]}`;
          const matchBigram =
            FuzzyMatcherService.findBestMatch(bigram, this.COLOMBIAN_CITIES, 0.80) ||
            FuzzyMatcherService.findBestMatch(fused, this.COLOMBIAN_CITIES, 0.80);
          if (matchBigram) {
            foundCity = this.capitalizeWords(matchBigram);
            break;
          }
        }
      }
    }

    // D. Si menciona únicamente un departamento reconocido o con error leve (ej: "Santander", "Cundinamarca")
    if (!foundCity) {
      for (const dept of this.COLOMBIAN_DEPARTMENTS) {
        const regex = new RegExp(`\\b${dept}\\b`, 'i');
        if (regex.test(normalizedFull)) {
          foundDepartment = this.capitalizeWords(dept);
          foundCity = foundDepartment;
          break;
        }
      }

      if (!foundCity) {
        const tokens = normalizedFull.split(/\s+/).filter((t) => t.length >= 4);
        for (const token of tokens) {
          const bestDept = FuzzyMatcherService.findBestMatch(token, this.COLOMBIAN_DEPARTMENTS, 0.84);
          if (bestDept) {
            foundDepartment = this.capitalizeWords(bestDept);
            foundCity = foundDepartment;
            break;
          }
        }
      }
    }

    if (!foundCity) {
      missing.push('*Ciudad o Municipio:* ¿En qué ciudad o municipio se encuentra para la entrega?');
    }

    // =========================================================================
    // 3. VALIDACIÓN DE NOMBRE DE CLIENTE
    // =========================================================================
    let foundName: string | undefined = previousData?.name;
    // Si el nombre previamente almacenado contiene palabras prohibidas (ej. "El Cuesta"), purgarlo
    if (foundName && (this.isBlacklistedName(foundName) || foundName.length < 3)) {
      foundName = undefined;
    }

    // Si aún no tenemos un nombre válido previo, intentamos extraerlo de forma rigurosa
    if (!foundName || foundName.length < 3) {
      // A. Si el cliente puso explícitamente "Nombre: ...", "Recibe: ...", "Me llamo ...", "A nombre de ..."
      const nameExplicitMatch = rawText.match(
        /(?:nombre(?:\s+completo|\s+y\s+apellido)?|recibe|destinatario|a\s+nombre\s+de|me\s+llamo|mi\s+nombre\s+es)\s*[:=\-]?\s*([a-zA-ZñáéíóúÁÉÍÓÚ\s]{3,40})/i
      );
      if (nameExplicitMatch && nameExplicitMatch[1]) {
        const candidate = nameExplicitMatch[1].trim();
        if (!this.isBlacklistedName(candidate)) {
          foundName = this.capitalizeWords(candidate);
        }
      }

      // B. En mensajes multilínea, buscar si una línea aislada corresponde al nombre (2 a 4 palabras alfabéticas limpias)
      if (!foundName && lines.length >= 2) {
        for (const line of lines) {
          const trimmedLine = line.trim();
          if (/\d/.test(trimmedLine)) continue;
          if (this.isBlacklistedName(trimmedLine)) continue;
          const normLine = this.normalize(trimmedLine);
          if (this.COLOMBIAN_CITIES.includes(normLine) || this.COLOMBIAN_DEPARTMENTS.includes(normLine)) continue;

          // Separar palabras limpiando signos de puntuación (comas, puntos)
          const words = trimmedLine
            .split(/\s+/)
            .map((w) => w.replace(/^[^\wáéíóúÁÉÍÓÚñÑ]+|[^\wáéíóúÁÉÍÓÚñÑ]+$/g, ''))
            .filter(Boolean);

          if (words.length >= 2 && words.length <= 4) {
            const allWordsValid = words.every((w) => {
              const nw = this.normalize(w);
              return /^[a-zA-ZñáéíóúÁÉÍÓÚ]+$/.test(w) &&
                     !this.BLACKLISTED_NAME_WORDS.has(nw) &&
                     !this.COLOMBIAN_CITIES.includes(nw) &&
                     !this.COLOMBIAN_DEPARTMENTS.includes(nw);
            });
            if (allWordsValid) {
              foundName = this.capitalizeWords(words.join(' '));
              break;
            }
          }
        }
      }

      // C. En mensaje de una sola línea con datos completos (ej: "Carlos Perez, Carrera 15 # 40-20, Bogota, 3101234567")
      if (!foundName) {
        const roadOrNumberMatch = rawText.search(
          /(?:calle|carrera|cra|cll|cr|cl|diagonal|transversal|av|avenida|mz|manzana|vereda|finca|oficina|interrapidisimo|\d{3,})/i
        );
        if (roadOrNumberMatch > 3) {
          const prefix = rawText.substring(0, roadOrNumberMatch).trim();
          const cleanTokens = prefix
            .split(/\s+/)
            .map((w) => w.replace(/^[^\wáéíóúÁÉÍÓÚñÑ]+|[^\wáéíóúÁÉÍÓÚñÑ]+$/g, ''))
            .filter(Boolean);

          if (cleanTokens.length >= 2 && cleanTokens.length <= 4) {
            const allValid = cleanTokens.every((w) => {
              const nw = this.normalize(w);
              return /^[a-zA-ZñáéíóúÁÉÍÓÚ]+$/.test(w) &&
                     !this.BLACKLISTED_NAME_WORDS.has(nw) &&
                     !this.COLOMBIAN_CITIES.includes(nw) &&
                     !this.COLOMBIAN_DEPARTMENTS.includes(nw);
            });
            if (allValid) {
              foundName = this.capitalizeWords(cleanTokens.join(' '));
            }
          }
        }
      }
    }

    if (!foundName) {
      missing.push('*Nombre y apellido:* ¿A nombre de quién registramos el paquete?');
    }

    // =========================================================================
    // 4. VALIDACIÓN DE DIRECCIÓN / RECLAMO EN OFICINA (INTERRAPIDÍSIMO, ETC.)
    // =========================================================================
    let foundAddress: string | undefined = previousData?.address;
    let isOfficeDelivery: boolean = Boolean(previousData?.isOfficeDelivery);
    let officeName: string | undefined = previousData?.officeName;

    // Detectar si el cliente desea entrega o reclamo en oficina de transportadora
    const isOfficeMentioned = this.OFFICE_TRANSPORTADORA_KEYWORDS.some((kw) =>
      new RegExp(`\\b${kw}\\b`, 'i').test(normalizedFull)
    );

    if (isOfficeMentioned) {
      isOfficeDelivery = true;
      if (/enterrapidicimo|interrapidisimo|interapidisimo|inter rapidisimo|inter/i.test(normalizedFull)) {
        officeName = 'Interrapidísimo';
      } else if (/servientrega/i.test(normalizedFull)) {
        officeName = 'Servientrega';
      } else if (/coordinadora/i.test(normalizedFull)) {
        officeName = 'Coordinadora';
      } else if (/envia/i.test(normalizedFull)) {
        officeName = 'Envía';
      } else {
        officeName = 'Interrapidísimo';
      }

      // Buscar si dio dirección específica de la oficina (ej: "calle 4 #8-29")
      const roadMatch = rawText.match(
        /(?:calle|carrera|cra|cll|cr|cl|diagonal|transversal|av|avenida)\s*\d+[\s#\-a-zA-Z0-9]*/i
      );

      // Buscar si especificó sucursal o sector (ej. "Interrapidisimo del centro", "sede principal")
      const branchMatch = rawText.match(
        /(?:interrapidisimo|servientrega|coordinadora|envia|tcc)\s*(?:\b(?:del|de|en|la)\b\s*)?([a-zA-ZñáéíóúÁÉÍÓÚ\s]{3,25})/i
      );

      if (roadMatch) {
        let cleanRoad = roadMatch[0].trim();
        if (foundCity) {
          const cityWords = foundCity.toLowerCase().replace(/,/g, '').split(/\s+/);
          for (const cw of cityWords) {
            if (cw.length >= 3) {
              cleanRoad = cleanRoad.replace(new RegExp(`\\b${cw}\\b.*$`, 'i'), '').trim();
            }
          }
        }
        foundAddress = cleanRoad ? `Oficina ${officeName} (${cleanRoad})` : `Reclamo en Oficina ${officeName}`;
      } else if (branchMatch && branchMatch[1] && !this.isBlacklistedName(branchMatch[1].trim())) {
        const cleanBranch = this.capitalizeWords(branchMatch[1].trim());
        foundAddress = `Oficina ${officeName} (${cleanBranch})`;
      } else {
        foundAddress = `Reclamo en Oficina ${officeName}`;
      }
    } else {
      // Entrega estándar a domicilio con nomenclatura
      const hasRoadWithNumber =
        /(?:calle|caye|carrera|karrera|cra|crra|krra|kra|cll|clle|cr|cl|diagonal|diag|dg|transversal|transv|tv|avenida|av|autopista)\s*#?\s*\d+/i.test(normalizedFull) ||
        /(?:manzana|mz)\s*[a-zA-Z0-9]+\s*(?:casa|lote)?\s*\d*/i.test(normalizedFull) ||
        /(?:km|kilometro)\s*\d+/i.test(normalizedFull) ||
        /(?:vereda|finca)\s+[a-zA-Z]+/i.test(normalizedFull) ||
        /(?:torre|bloque|apto|apartamento)\s*\d+/i.test(normalizedFull);

      const hasNumbers = /\d{1,}/.test(normalizedFull);
      const isPlaceholder = lines.some((line) =>
        this.INVALID_ADDRESS_PATTERNS.some((p) => p.test(line.toLowerCase().trim()))
      );

      if (hasRoadWithNumber && hasNumbers && !isPlaceholder) {
        const roadMatch = rawText.match(
          /(?:calle|caye|carrera|karrera|cra|crra|krra|kra|cll|clle|cr|cl|diagonal|diag|dg|transversal|transv|tv|avenida|av|autopista|manzana|mz|vereda|finca|km)[\s#\-a-zA-Z0-9]*/i
        );
        let cleanRoad = roadMatch ? roadMatch[0].trim() : 'Dirección con nomenclatura confirmada';
        if (foundCity && roadMatch) {
          const cityWords = foundCity.toLowerCase().replace(/,/g, '').split(/\s+/);
          for (const cw of cityWords) {
            if (cw.length >= 3) {
              cleanRoad = cleanRoad.replace(new RegExp(`\\b${cw}\\b.*$`, 'i'), '').trim();
            }
          }
        }
        foundAddress = cleanRoad || 'Dirección con nomenclatura confirmada';
      }
    }

    if (!foundAddress) {
      missing.push(
        '*Dirección o punto de entrega:* Su dirección exacta (Calle/Carrera con número de casa) o indíquenos si prefiere *Reclamo en Oficina de Interrapidísimo*'
      );
    }

    // =========================================================================
    // 5. DETECCIÓN DE BARRIO O SECTOR
    // =========================================================================
    let foundNeighborhood: string | undefined = previousData?.neighborhood;
    for (const line of lines) {
      const normLine = this.normalize(line);
      if (normLine.includes('barrio') || normLine.includes('sector') || normLine.includes('comuna')) {
        foundNeighborhood = this.capitalizeWords(line.replace(/^(?:barrio|sector|comuna)\s*/i, '').trim());
        break;
      }

      // No interpretar como barrio el nombre del cliente, la ciudad o transportadora
      if (foundName && normLine === this.normalize(foundName)) continue;
      if (foundCity && this.normalize(foundCity).includes(normLine)) continue;
      if (this.OFFICE_TRANSPORTADORA_KEYWORDS.some((kw) => normLine.includes(kw))) continue;

      // Si la línea tiene 1 o 2 palabras, no tiene números, no es transportadora ni ciudad conocida (ej: "Santa cruz")
      if (line.split(/\s+/).length <= 3 && !/\d/.test(line) && !this.isBlacklistedName(line)) {
        const norm = this.normalize(line);
        if (
          norm !== this.normalize(foundCity || '') &&
          !this.COLOMBIAN_CITIES.includes(norm) &&
          !this.COLOMBIAN_DEPARTMENTS.includes(norm)
        ) {
          foundNeighborhood = this.capitalizeWords(line.trim());
        }
      }
    }

    // =========================================================================
    // EVALUACIÓN FINAL Y MENSAJE DE RETROALIMENTACIÓN HUMANO Y EMPÁTICO
    // =========================================================================
    const isValid = missing.length === 0;

    let feedbackMessage: string | undefined;
    if (!isValid) {
      const alreadyCollected: string[] = [];
      // Solo reconocer el nombre si es un nombre legítimo de al menos 2 palabras
      if (foundName && !this.isBlacklistedName(foundName) && foundName.split(' ').length >= 2) {
        alreadyCollected.push(`nombre (${foundName})`);
      }
      if (foundPhone) alreadyCollected.push(`celular (${foundPhone})`);
      if (foundCity) {
        const destDisplay = foundNeighborhood ? `${foundCity} - ${foundNeighborhood}` : foundCity;
        alreadyCollected.push(`destino (${destDisplay})`);
      }
      if (foundAddress) alreadyCollected.push(`entrega (${foundAddress})`);

      let partialAck = '';
      if (alreadyCollected.length > 0) {
        partialAck = `Ya registramos su ${alreadyCollected.join(', ')}.\n\n`;
      }

      feedbackMessage =
        `Con mucho gusto. ${partialAck}` +
        `Por favor facilítenos para programar el despacho:\n` +
        missing.map((f) => `• ${f}`).join('\n') +
        `\n\n*(Envío Gratis y pago contra entrega en efectivo 🚚)*`;
    }

    return {
      isValid,
      name: foundName,
      city: foundCity,
      department: foundDepartment,
      neighborhood: foundNeighborhood,
      address: foundAddress,
      phone: foundPhone,
      isOfficeDelivery,
      officeName,
      missingFields: missing,
      feedbackMessage,
      hasPendingDoubt,
      doubtTopic,
      doubtAnswer,
    };
  }

  /**
   * Capitaliza nombres propios o municipios
   */
  public static capitalizeWords(str: string): string {
    return str
      .toLowerCase()
      .split(' ')
      .map((word) => (word.length > 0 ? word.charAt(0).toUpperCase() + word.slice(1) : ''))
      .join(' ')
      .trim();
  }

  /**
   * Determina si una cadena contiene términos prohibidos para un nombre de cliente
   */
  public static isBlacklistedName(candidate: string): boolean {
    const norm = this.normalize(candidate);
    const words = norm.split(' ');
    return words.some((w) => this.BLACKLISTED_NAME_WORDS.has(w));
  }
}
