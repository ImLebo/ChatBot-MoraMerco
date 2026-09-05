export interface CustomerShippingData {
  isValid: boolean;
  name?: string;
  city?: string;
  address?: string;
  phone?: string;
  missingFields: string[];
  feedbackMessage?: string;
}

export class DataValidatorService {
  /**
   * Principales ciudades y municipios de Colombia con cobertura de transportadoras
   */
  private static readonly COLOMBIAN_CITIES = [
    // Principales capitales
    'bogota', 'medellin', 'cali', 'barranquilla', 'cartagena', 'bucaramanga',
    'pereira', 'manizales', 'santa marta', 'ibague', 'cucuta', 'pasto',
    'neiva', 'villavicencio', 'armenia', 'valledupar', 'monteria', 'sincelejo',
    'popayan', 'tunja', 'riohacha', 'florencia', 'quibdo', 'yopal', 'mocoa',
    'san andres', 'leticia', 'arauca', 'mitu', 'puerto carreno', 'inirida',
    // Municipios y áreas metropolitanas importantes
    'soacha', 'bello', 'palmira', 'itagui', 'envigado', 'dosquebradas',
    'floridablanca', 'giron', 'piedecuesta', 'chia', 'zipaquira', 'facatativa',
    'mosquera', 'madrid', 'funza', 'fusagasuga', 'girardot', 'rionegro',
    'sabaneta', 'la estrella', 'apartado', 'turbo', 'cartago', 'tulua', 'buga',
    'jamundi', 'buenaventura', 'yumbo', 'barrancabermeja', 'sogamoso', 'duitama',
    'ocana', 'pamplona', 'ipiales', 'la dorada', 'chinchina', 'villamaria',
    'espinal', 'melgar', 'cajica', 'cota', 'sopo', 'tocancipa', 'la calera',
    'tabio', 'tenjo', 'sibate', 'marinilla', 'guarne', 'el carmen de viboral',
    'copacabana', 'caldas', 'barbosa', 'santander de quilichao', 'cerete',
    'sahagun', 'montelibano', 'lorica', 'caucasia', 'magangue', 'cienfuegos',
    'turbaco', 'arjona', 'malambo', 'soledad', 'sabanalarga', 'baranoa',
    'fundacion', 'cienaga', 'el banco', 'plato', 'aguachica', 'codazzi',
    'maicao', 'manaure', 'fonseca', 'san juan del cesar', 'garzon', 'pitalito',
    'la plata', 'acacias', 'granada', 'puerto lopez', 'aguazul', 'villa del rosario',
    'los patios', 'tibú', 'chiquinquira', 'paipa', 'moniquira', 'puerto boyaca'
  ];

  /**
   * Indicadores de vías o nomenclatura oficial
   */
  private static readonly ROAD_INDICATORS = [
    'calle', 'carrera', 'cra', 'cll', 'cr', 'cl', 'diagonal', 'diag', 'dg',
    'transversal', 'transv', 'tv', 'avenida', 'av', 'autopista', 'manzana',
    'mz', 'lote', 'km', 'kilometro', 'vereda', 'finca', 'circular', 'peatonal',
    'condominio', 'conjunto', 'urbanizacion', 'urb'
  ];

  /**
   * Textos vagos que los clientes a veces ponen en vez de una dirección real
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
   * Normaliza texto para comparaciones
   */
  private static normalize(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w\s#\-]/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Valida la coherencia de los datos de envío proporcionados por el cliente
   */
  public static validate(rawText: string): CustomerShippingData {
    const lines = rawText.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
    const normalizedFull = this.normalize(rawText);
    const missing: string[] = [];

    // -------------------------------------------------------------------------
    // 1. VALIDACIÓN DE TELÉFONO CELULAR
    // -------------------------------------------------------------------------
    let foundPhone: string | undefined;
    let hasMalformedPhone = false;

    // Detectar números con letras intercaladas (ej: 30065t11324)
    const malformedRegex = /\b\d{3,}[a-zA-Z]+\d*\b|\b[a-zA-Z]+\d{5,}\b/;
    if (malformedRegex.test(rawText)) {
      hasMalformedPhone = true;
    }

    // Buscar celular colombiano de 10 dígitos (inicia por 3)
    const phoneCleaned = rawText.replace(/[^\d]/g, ' ');
    const phoneCandidates = phoneCleaned.split(/\s+/).filter((num) => num.length >= 7);

    for (const cand of phoneCandidates) {
      // Si tiene código de país 57 adelante (ej: 573001234567)
      if (cand.startsWith('57') && cand.length === 12 && cand[2] === '3') {
        foundPhone = cand.substring(2);
        break;
      }
      // Celular estándar de 10 dígitos
      if (cand.length === 10 && cand.startsWith('3')) {
        foundPhone = cand;
        break;
      }
    }

    if (!foundPhone) {
      if (hasMalformedPhone) {
        missing.push('*Celular:* Me confirmas tu número de 10 dígitos correcto (el que enviaste tiene una letra escrita)');
      } else {
        missing.push('*Celular:* Número de contacto de 10 dígitos (ej: 3001234567)');
      }
    }

    // -------------------------------------------------------------------------
    // 2. VALIDACIÓN DE CIUDAD O MUNICIPIO
    // -------------------------------------------------------------------------
    let foundCity: string | undefined;
    for (const city of this.COLOMBIAN_CITIES) {
      // Buscar palabra exacta de la ciudad
      const regex = new RegExp(`\\b${city}\\b`, 'i');
      if (regex.test(normalizedFull)) {
        foundCity = city.charAt(0).toUpperCase() + city.slice(1);
        break;
      }
    }

    if (!foundCity) {
      missing.push('*Ciudad o Municipio:* ¿En qué ciudad o municipio te encuentras para programar la entrega?');
    }

    // -------------------------------------------------------------------------
    // 3. VALIDACIÓN DE DIRECCIÓN EXACTA
    // -------------------------------------------------------------------------
    let foundAddress: string | undefined;
    let hasInvalidPlaceholder = false;

    // Revisar si alguna línea es un placeholder vago como "Mi casa"
    for (const line of lines) {
      const normLine = line.toLowerCase().trim();
      if (this.INVALID_ADDRESS_PATTERNS.some((p) => p.test(normLine))) {
        hasInvalidPlaceholder = true;
      }
    }

    // Verificar si existe una dirección estructurada con nomenclatura y números
    // Ejemplos: Calle 10 # 20-30, Cra 15 40 20, Mz 4 Casa 12, Km 5, Vereda El Salado
    const hasRoadWithNumber =
      /(?:calle|carrera|cra|cll|cr|cl|diagonal|diag|dg|transversal|transv|tv|avenida|av|autopista)\s*#?\s*\d+/i.test(normalizedFull) ||
      /(?:manzana|mz)\s*[a-zA-Z0-9]+\s*(?:casa|lote)?\s*\d*/i.test(normalizedFull) ||
      /(?:km|kilometro)\s*\d+/i.test(normalizedFull) ||
      /(?:vereda|finca)\s+[a-zA-Z]+/i.test(normalizedFull) ||
      /(?:torre|bloque|apto|apartamento)\s*\d+/i.test(normalizedFull);

    // Debe tener números además de no ser un placeholder vago
    const hasNumbers = /\d{1,}/.test(normalizedFull);

    if (hasRoadWithNumber && hasNumbers) {
      foundAddress = 'DIRECCION_DETECTADA';
    } else {
      if (hasInvalidPlaceholder) {
        missing.push("*Dirección exacta con números:* (ej: Calle, Carrera o Manzana con número de casa o apto, ya que 'Mi casa' no tiene nomenclatura para la transportadora)");
      } else {
        missing.push('*Dirección exacta:* Calle, Carrera o Manzana con número de casa o apartamento');
      }
    }

    // -------------------------------------------------------------------------
    // 4. VALIDACIÓN DE NOMBRE
    // -------------------------------------------------------------------------
    let foundName: string | undefined;
    // Si la primera línea tiene al menos dos palabras y no tiene números, suele ser el nombre
    if (lines.length > 0 && lines[0].split(' ').length >= 2 && !/\d/.test(lines[0])) {
      foundName = lines[0];
    } else if (rawText.toLowerCase().includes('nombre')) {
      foundName = 'NOMBRE_DETECTADO';
    } else if (lines.length >= 2) {
      foundName = lines[0];
    } else {
      // Si todo vino en una sola línea, verificar si tiene texto alfabético suficiente
      const words = rawText.split(/\s+/).filter((w) => /^[a-zA-ZáéíóúÁÉÍÓÚñÑ]+$/.test(w));
      if (words.length >= 2) {
        foundName = `${words[0]} ${words[1]}`;
      }
    }

    if (!foundName || foundName.length < 3) {
      missing.push('*Nombre completo:* Nombre y apellido de quien recibe');
    }

    // -------------------------------------------------------------------------
    // EVALUACIÓN FINAL
    // -------------------------------------------------------------------------
    const isValid = missing.length === 0;

    let feedbackMessage: string | undefined;
    if (!isValid) {
      const introName = foundName && foundName !== 'NOMBRE_DETECTADO' ? `, ${foundName.split(' ')[0]}` : '';
      feedbackMessage =
        `Apreciado/a cliente${introName}, para que la transportadora pueda entregar su pedido directamente en su domicilio sin contratiempos, por favor facilítenos los siguientes datos faltantes:\n\n` +
        missing.map((f) => `• ${f}`).join('\n') +
        `\n\nCon estos datos coordinaremos de inmediato su despacho el día de hoy 🚚📦`;
    }

    return {
      isValid,
      name: foundName,
      city: foundCity,
      address: foundAddress,
      phone: foundPhone,
      missingFields: missing,
      feedbackMessage,
    };
  }
}
