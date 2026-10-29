import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import path from 'path';
import { GoogleSheetsService } from './infrastructure/sheets/google-sheets.service.js';
import { env } from './config/env.config.js';

async function testGoogleSheets() {
  console.log('🧪 Iniciando prueba de conexión con Google Sheets...\n');
  console.log(`📄 Spreadsheet ID: ${env.googleSheetsSpreadsheetId}`);
  console.log(`🔑 Credentials Path: ${env.googleSheetsCredentialsPath}`);
  console.log(`📑 Tab Name: ${env.googleSheetsTabName}\n`);

  const credentialsPath = env.googleSheetsCredentialsPath
    ? path.resolve(process.cwd(), env.googleSheetsCredentialsPath)
    : '';

  if (!fs.existsSync(credentialsPath)) {
    console.error(`❌ ERROR: No se encontró el archivo de credenciales en:\n   ${credentialsPath}\n`);
    console.log('👉 Para solucionarlo:');
    console.log('1. Ve a Google Cloud Console (IAM y administración > Cuentas de servicio).');
    console.log('2. Entra a la cuenta "pedidos@backend-lebo.iam.gserviceaccount.com".');
    console.log('3. En la pestaña "Claves" (Keys) -> "Agregar clave" -> "Crear clave nueva" -> formato JSON.');
    console.log('4. Guarda el archivo descargado como:');
    console.log(`   ${credentialsPath}`);
    console.log('5. Asegúrate de compartir tu hoja de cálculo:');
    console.log('   https://docs.google.com/spreadsheets/d/' + env.googleSheetsSpreadsheetId + '/edit');
    console.log('   con "pedidos@backend-lebo.iam.gserviceaccount.com" dándole permisos de EDITOR.\n');
    process.exit(1);
  }

  const service = new GoogleSheetsService(
    env.googleSheetsSpreadsheetId,
    env.googleSheetsCredentialsPath,
    env.googleSheetsTabName
  );

  if (!service.isConfigured()) {
    console.error('❌ El servicio de Google Sheets no se pudo inicializar. Revisa el archivo JSON de credenciales.');
    process.exit(1);
  }

  console.log('1️⃣ Verificando / creando encabezados de columnas...');
  await service.ensureHeadersExist();

  console.log('\n2️⃣ Registrando pedido de prueba...');
  const success = await service.appendOrder({
    orderDate: new Date(),
    dropiId: 'TEST-1234',
    customerName: 'Cliente Prueba ChatBot',
    phone: '3001234567',
    product: 'Luz Lineal Solar 10m (2 Unidades)',
    price: 79900,
    city: 'Bogotá',
    department: 'Cundinamarca',
    address: 'Calle 100 # 15 - 20',
    neighborhood: 'Chicó',
    deliveryType: 'Envío Gratis',
    paymentMethod: 'Contra entrega en efectivo',
    status: 'PRUEBA_SISTEMA',
  });

  if (success) {
    console.log('🎉 ¡Prueba completada con ÉXITO! El pedido se reflejó en tu hoja de cálculo.');
  } else {
    console.error('❌ Hubo un error al registrar el pedido de prueba. Revisa los permisos de la cuenta en la hoja.');
  }
}

testGoogleSheets().catch((err) => {
  console.error('❌ Error no controlado en la prueba:', err);
});
