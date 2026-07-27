const dotenv = require('dotenv');
// Geen override: Hostinger/panel-env vars winnen van een eventuele .env.
dotenv.config();

const mode = (process.env.PAYMENT_MODE || 'mock').toLowerCase();

const config = {
  // Hostinger injecteert PORT; lokaal default 3000. Bind altijd op 0.0.0.0 (niet alleen localhost).
  host: process.env.HOST || '0.0.0.0',
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

function priceLabel() {
  return (config.priceCents / 100).toFixed(2).replace('.', ',');
}

function assertPaymentConfig() {
  if (config.paymentMode === 'mock') return;
  if (!config.mollieApiKey) {
    // Niet crashen op hosting: val terug op mock i.p.v. 503.
    console.warn(
      `⚠️  PAYMENT_MODE=${config.paymentMode} zonder MOLLIE_API_KEY — val terug op mock.`,
    );
    config.paymentMode = 'mock';
    return;
  }
  if (config.paymentMode === 'test' && !config.mollieApiKey.startsWith('test_')) {
    console.warn('⚠️  PAYMENT_MODE=test maar key begint niet met test_ — controleer je Mollie-key.');
  }
  if (config.paymentMode === 'live' && !config.mollieApiKey.startsWith('live_')) {
    console.warn('⚠️  PAYMENT_MODE=live maar key begint niet met live_ — controleer je Mollie-key.');
  }
}

exports.priceLabel = priceLabel;
exports.assertPaymentConfig = assertPaymentConfig;
exports.config = config;
