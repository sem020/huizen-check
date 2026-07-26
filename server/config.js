import dotenv from 'dotenv';
dotenv.config({ override: true });

const mode = (process.env.PAYMENT_MODE || 'mock').toLowerCase();

export const config = {
  port: Number(process.env.PORT || 3000),
  publicUrl: (process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, ''),
  paymentMode: ['mock', 'test', 'live'].includes(mode) ? mode : 'mock',
  mollieApiKey: process.env.MOLLIE_API_KEY || '',
  priceCents: Number(process.env.PRICE_CENTS || 495),
  productName: process.env.PRODUCT_NAME || 'Pandloket PDF',
  mailFrom: process.env.MAIL_FROM || 'Pandloket <noreply@pandloket.nl>',
  resendApiKey: process.env.RESEND_API_KEY || '',
  epOnlineApiKey: (process.env.EP_ONLINE_API_KEY || '').trim(),
};

export function priceLabel() {
  return (config.priceCents / 100).toFixed(2).replace('.', ',');
}

export function assertPaymentConfig() {
  if (config.paymentMode === 'mock') return;
  if (!config.mollieApiKey) {
    throw new Error(`PAYMENT_MODE=${config.paymentMode} vereist MOLLIE_API_KEY in .env`);
  }
  if (config.paymentMode === 'test' && !config.mollieApiKey.startsWith('test_')) {
    console.warn('⚠️  PAYMENT_MODE=test maar key begint niet met test_ — controleer je Mollie-key.');
  }
  if (config.paymentMode === 'live' && !config.mollieApiKey.startsWith('live_')) {
    console.warn('⚠️  PAYMENT_MODE=live maar key begint niet met live_ — controleer je Mollie-key.');
  }
}
