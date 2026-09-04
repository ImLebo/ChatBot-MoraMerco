import qrcode from 'qrcode-terminal';

export class QrService {
  public displayQr(qr: string): void {
    console.log('\n======================================================');
    console.log('⚡ ESCANEA ESTE CÓDIGO QR EN TU WHATSAPP ("Dispositivos vinculados"):');
    console.log('======================================================\n');
    qrcode.generate(qr, { small: true });
    console.log('\n======================================================\n');
  }
}
