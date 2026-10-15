import fs from 'fs';
import path from 'path';
import { google, sheets_v4 } from 'googleapis';
import { ISheetsService, OrderRecord } from '../../domain/services/sheets-service.interface.js';

export class GoogleSheetsService implements ISheetsService {
  private sheetsClient?: sheets_v4.Sheets;
  private readonly spreadsheetId?: string;
  private readonly credentialsPath?: string;
  private readonly tabName: string;
  private isHeaderChecked = false;

  private static readonly DEFAULT_HEADERS = [
    'Fecha y Hora',
    'ID Dropi',
    'Cliente',
    'Teléfono',
    'WhatsApp Directo',
    'Producto',
    'Precio COP',
    'Ciudad / Municipio',
    'Departamento',
    'Dirección',
    'Barrio',
    'Modalidad de Entrega',
    'Método de Pago',
    'Estado',
  ];

  constructor(
    spreadsheetId?: string,
    credentialsPath?: string,
    tabName: string = 'Hoja 1'
  ) {
    this.spreadsheetId = spreadsheetId?.trim();
    this.credentialsPath = credentialsPath?.trim();
    this.tabName = tabName.trim() || 'Hoja 1';

    this.initializeClient();
  }

  private initializeClient(): void {
    if (!this.spreadsheetId) {
      console.log('⚠️ [Google Sheets] GOOGLE_SHEETS_SPREADSHEET_ID no configurado.');
      return;
    }

    if (!this.credentialsPath) {
      console.log('⚠️ [Google Sheets] GOOGLE_SHEETS_CREDENTIALS_PATH no configurado.');
      return;
    }

    const resolvedPath = path.isAbsolute(this.credentialsPath)
      ? this.credentialsPath
      : path.resolve(process.cwd(), this.credentialsPath);

    if (!fs.existsSync(resolvedPath)) {
      console.warn(`⚠️ [Google Sheets] Archivo de credenciales no encontrado en: ${resolvedPath}`);
      return;
    }

    try {
      const auth = new google.auth.GoogleAuth({
        keyFile: resolvedPath,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });

      this.sheetsClient = google.sheets({ version: 'v4', auth });
      console.log('📊 [Google Sheets] Cliente autenticado correctamente con cuenta de servicio.');
    } catch (error) {
      console.error('❌ [Google Sheets] Error al inicializar autenticación de Google Sheets:', error);
    }
  }

  public isConfigured(): boolean {
    return Boolean(this.sheetsClient && this.spreadsheetId);
  }

  /**
   * Verifica si la hoja tiene encabezados, y si no los tiene, los crea en la fila 1
   */
  public async ensureHeadersExist(forceUpdate: boolean = false): Promise<void> {
    if ((this.isHeaderChecked && !forceUpdate) || !this.sheetsClient || !this.spreadsheetId) {
      return;
    }

    try {
      const response = await this.sheetsClient.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `'${this.tabName}'!A1:N1`,
      });

      const rows = response.data.values;
      if (forceUpdate || !rows || rows.length === 0 || rows[0].length === 0) {
        // Insertar encabezados
        await this.sheetsClient.spreadsheets.values.update({
          spreadsheetId: this.spreadsheetId,
          range: `'${this.tabName}'!A1:N1`,
          valueInputOption: 'USER_ENTERED',
          requestBody: {
            values: [GoogleSheetsService.DEFAULT_HEADERS],
          },
        });
        console.log(`📋 [Google Sheets] Encabezados actualizados exitosamente en la pestaña "${this.tabName}".`);
      }
      this.isHeaderChecked = true;
    } catch (error: any) {
      console.warn(`⚠️ [Google Sheets] No se pudieron verificar/crear encabezados: ${error.message}`);
    }
  }

  /**
   * Agrega un nuevo pedido confirmado a la hoja de cálculo
   */
  public async appendOrder(order: OrderRecord): Promise<boolean> {
    if (!this.isConfigured() || !this.sheetsClient || !this.spreadsheetId) {
      console.warn('⚠️ [Google Sheets] Servicio no configurado o inactivo. Se omite registro.');
      return false;
    }

    try {
      await this.ensureHeadersExist();

      const now = order.orderDate
        ? (order.orderDate instanceof Date ? order.orderDate : new Date(order.orderDate))
        : new Date();

      const formattedDate = now.toLocaleString('es-CO', {
        timeZone: 'America/Bogota',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      });

      const cleanPhone = order.phone.replace(/[^\d]/g, '');
      const waNumber = cleanPhone.length === 10 && cleanPhone.startsWith('3')
        ? `57${cleanPhone}`
        : cleanPhone.startsWith('57')
          ? cleanPhone
          : cleanPhone;

      const whatsappLink = order.whatsappLink || `https://wa.me/${waNumber}`;

      // El dinero se registra como un número entero sin puntos ni símbolos para cálculos en COP
      let cleanPrice: number;
      if (typeof order.price === 'number') {
        cleanPrice = Math.round(order.price);
      } else {
        const numericOnly = String(order.price).replace(/[^\d]/g, '');
        cleanPrice = numericOnly ? parseInt(numericOnly, 10) : 0;
      }

      const rowValues = [
        formattedDate,
        order.dropiId ? String(order.dropiId) : '1931414',
        order.customerName,
        order.phone,
        whatsappLink,
        order.product,
        cleanPrice,
        order.city,
        order.department || '',
        order.address,
        order.neighborhood || '',
        order.deliveryType,
        order.paymentMethod || 'Contra entrega en efectivo',
        order.status || 'CONFIRMADO',
      ];

      await this.sheetsClient.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range: `'${this.tabName}'!A:N`,
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: {
          values: [rowValues],
        },
      });

      console.log(`\n📊 [GOOGLE SHEETS] ✅ Pedido de ${order.customerName} (+${order.phone}) [COP ${cleanPrice}] registrado con éxito en Google Sheets.\n`);
      return true;
    } catch (error: any) {
      console.error(`❌ [Google Sheets] Error al registrar pedido en la hoja: ${error.message}`);
      return false;
    }
  }
}

