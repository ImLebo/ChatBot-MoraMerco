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
  private static readonly BLACKLISTED_NAME_WORDS = new Set([
    'interrapidisimo', 'enterrapidicimo', 'interapidisimo', 'inter', 'rapidisimo',
    'servientrega', 'coordinadora', 'envia', 'tcc', 'deprisa', 'veloces',
    'oficina', 'sucursal', 'agencia', 'bodega', 'reclamo', 'recoger', 'entrega',
    'calle', 'carrera', 'cra', 'cll', 'cr', 'cl', 'diagonal', 'diag', 'dg',
    'transversal', 'transv', 'tv', 'avenida', 'av', 'barrio', 'casa', 'apto',
    'apartamento', 'manzana', 'mz', 'lote', 'km', 'kilometro', 'vereda', 'finca',
    'selular', 'celular', 'tel', 'telefono', 'contacto', 'whatsapp', 'numero',
    'hola', 'buenas', 'buenos', 'tardes', 'dias', 'noches', 'gracias', 'favor',
    'por', 'pedido', 'base', 'nevera', 'lavadora', 'kit', 'si', 'confirmar',
    'nombre', 'direccion', 'ciudad', 'municipio', 'departamento', 'santander',
    'boyaca', 'cundinamarca', 'antioquia', 'colombia', 'medellin', 'bogota', 'cali',
    // Peticiones de fotos, amabilidad o acciones que los clientes escriben
    'envieme', 'mandeme', 'compartame', 'regaleme', 'muestreme', 'pase', 'paseme',
    'enviar', 'mandar', 'compartir', 'ver', 'mostrar', 'foto', 'fotos', 'fotp',
    'fotico', 'foticos', 'imagen', 'imagenes', 'video', 'videos', 'catalogo',
    'muchas', 'mil', 'amable', 'porfa', 'muy'
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
   * Valida la coherencia de los datos de envío proporcionados por el cliente,
   * permitiendo fusionar información acumulada en turnos previos.
   */
  public static validate(rawText: string, previousData?: CustomerShippingData): CustomerShippingData {
    const lines = rawText.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
    const normalizedFull = this.normalize(rawText);
    const missing: string[] = [];

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

    // C. Si menciona únicamente un departamento reconocido (ej: "Santander")
    if (!foundCity) {
      for (const dept of this.COLOMBIAN_DEPARTMENTS) {
        const regex = new RegExp(`\\b${dept}\\b`, 'i');
        if (regex.test(normalizedFull)) {
          foundDepartment = this.capitalizeWords(dept);
          foundCity = foundDepartment;
          break;
        }
      }
    }

    if (!foundCity) {
      missing.push('*Ciudad o Municipio:* ¿En qué ciudad o municipio se encuentra para la entrega?');
    }

    // =========================================================================
    // 3. DETECCIÓN DE BARRIO O SECTOR
    // =========================================================================
    let foundNeighborhood: string | undefined = previousData?.neighborhood;
    for (const line of lines) {
      const normLine = this.normalize(line);
      if (normLine.includes('barrio') || normLine.includes('sector') || normLine.includes('comuna')) {
        foundNeighborhood = this.capitalizeWords(line.replace(/^(?:barrio|sector|comuna)\s*/i, '').trim());
        break;
      }
      // Si la línea tiene 1 o 2 palabras, no tiene números, no es transportadora ni ciudad conocida (ej: "Santa cruz")
      if (line.split(/\s+/).length <= 3 && !/\d/.test(line) && !this.isBlacklistedName(line)) {
        const norm = this.normalize(line);
        if (
          norm !== this.normalize(foundCity || '') &&
          !this.COLOMBIAN_CITIES.includes(norm) &&
          !this.COLOMBIAN_DEPARTMENTS.includes(norm)
        ) {
          // Si no es el nombre del cliente
          if (!previousData?.name || !this.normalize(previousData.name).includes(norm)) {
            foundNeighborhood = this.capitalizeWords(line.trim());
          }
        }
      }
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
      } else {
        foundAddress = `Reclamo en Oficina ${officeName}`;
      }
    } else {
      // Entrega estándar a domicilio con nomenclatura
      const hasRoadWithNumber =
        /(?:calle|carrera|cra|cll|cr|cl|diagonal|diag|dg|transversal|transv|tv|avenida|av|autopista)\s*#?\s*\d+/i.test(normalizedFull) ||
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
          /(?:calle|carrera|cra|cll|cr|cl|diagonal|diag|dg|transversal|transv|tv|avenida|av|autopista|manzana|mz|vereda|finca|km)[\s#\-a-zA-Z0-9]*/i
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
    // 5. VALIDACIÓN DE NOMBRE DE CLIENTE
    // =========================================================================
    let foundName: string | undefined = previousData?.name;

    // Si aún no tenemos un nombre válido previo, intentamos extraerlo de forma inteligente
    if (!foundName || foundName.length < 3) {
      // Si el cliente puso explícitamente "Nombre: ..."
      const nameExplicitMatch = rawText.match(/(?:nombre|recibe|destinatario)\s*:\s*([a-zA-ZñáéíóúÁÉÍÓÚ\s]{3,40})/i);
      if (nameExplicitMatch && nameExplicitMatch[1]) {
        const candidate = nameExplicitMatch[1].trim();
        if (!this.isBlacklistedName(candidate)) {
          foundName = this.capitalizeWords(candidate);
        }
      }

      // Si no, analizar palabras y descartar números, transportadoras, vías, barrios y municipios
      if (!foundName) {
        const rawWords = rawText.split(/\s+/).map((w) => w.trim());
        const validNameWords: string[] = [];

        for (const word of rawWords) {
          const cleanWord = this.normalize(word);
          if (!cleanWord || cleanWord.length < 2) continue;
          if (/\d/.test(cleanWord)) continue;
          if (this.BLACKLISTED_NAME_WORDS.has(cleanWord)) continue;
          if (this.COLOMBIAN_CITIES.includes(cleanWord)) continue;
          if (this.COLOMBIAN_DEPARTMENTS.includes(cleanWord)) continue;

          // Descartar si coincide con el barrio detectado
          if (foundNeighborhood && this.normalize(foundNeighborhood).includes(cleanWord)) continue;

          // Solo letras alfabéticas
          if (/^[a-zA-ZñáéíóúÁÉÍÓÚ]+$/.test(word)) {
            validNameWords.push(word);
          }
        }

        // Si encontramos entre 1 y 4 palabras consecutivas que parecen nombre y apellido
        if (validNameWords.length >= 2) {
          const joinedCandidate = validNameWords.slice(0, 4).join(' ');
          if (!this.isBlacklistedName(joinedCandidate)) {
            foundName = this.capitalizeWords(joinedCandidate);
          }
        } else if (validNameWords.length === 1 && lines.length === 1 && validNameWords[0].length >= 3) {
          if (!this.isBlacklistedName(validNameWords[0])) {
            foundName = this.capitalizeWords(validNameWords[0]);
          }
        }
      }
    }

    if (!foundName || foundName.length < 3) {
      missing.push('*Nombre y apellido:* Nombre completo de quien recibe el paquete');
    }

    // =========================================================================
    // EVALUACIÓN FINAL Y MENSAJE DE RETROALIMENTACIÓN HUMANO Y EMPÁTICO
    // =========================================================================
    const isValid = missing.length === 0;

    let feedbackMessage: string | undefined;
    if (!isValid) {
      const firstName =
        foundName && !this.isBlacklistedName(foundName)
          ? foundName.split(' ')[0]
          : undefined;

      const greeting = firstName ? `Con mucho gusto, ${firstName}. ` : `Con mucho gusto. `;

      // Construir resumen de datos ya capturados para dar tranquilidad y no repetir pedidos
      const alreadyCollected: string[] = [];
      if (foundName && !this.isBlacklistedName(foundName)) alreadyCollected.push(`• Destinatario: ${foundName}`);
      if (foundPhone) alreadyCollected.push(`• Teléfono: ${foundPhone}`);
      if (foundCity) {
        const destDisplay = foundNeighborhood ? `${foundCity} (Barrio ${foundNeighborhood})` : foundCity;
        alreadyCollected.push(`• Destino: ${destDisplay}`);
      }
      if (foundAddress) alreadyCollected.push(`• Entrega: ${foundAddress}`);

      let partialAck = '';
      if (alreadyCollected.length > 0) {
        partialAck = `Ya tenemos registrado:\n${alreadyCollected.join('\n')}\n\n`;
      }

      feedbackMessage =
        `${greeting}${partialAck}` +
        `Para coordinar su entrega con *Envío Gratis* y pago contra entrega en efectivo, por favor facilítenos el siguiente dato faltante:\n\n` +
        missing.map((f) => `• ${f}`).join('\n') +
        `\n\n*(Recuerde que si lo prefiere, también podemos despachárselo para reclamar en la oficina de Interrapidísimo de su municipio 🚚📦)*`;
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
