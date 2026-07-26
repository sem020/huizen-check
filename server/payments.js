import { randomUUID } from 'crypto';
import { config, priceLabel } from './config.js';
import { saveOrder, getOrder, updateOrder } from './store.js';
import { genereerPdfBestand } from './pdf.js';
import { stuurRapportMail } from './mail.js';

const MOLLIE_API = 'https://api.mollie.com/v2';

function dossierSnapshot(raw = {}) {
  return {
    adres: String(raw.adres || '').slice(0, 200),
    plaats: String(raw.plaats || '').slice(0, 200),
    bouwjaar: String(raw.bouwjaar || '—').slice(0, 40),
    oppervlak: String(raw.oppervlak || '—').slice(0, 40),
    wozKort: String(raw.wozKort || '—').slice(0, 40),
    wozBedrag: String(raw.wozBedrag || '—').slice(0, 40),
    wozDelta: String(raw.wozDelta || '').slice(0, 40),
    chips: Array.isArray(raw.chips) ? raw.chips.slice(0, 20).map(String) : [],
    wozRijen: Array.isArray(raw.wozRijen)
      ? raw.wozRijen.slice(0, 30).map(r => ({ jaar: Number(r.jaar) || 0, waarde: Number(r.waarde) || 0 }))
      : [],
    bronnen: Array.isArray(raw.bronnen)
      ? raw.bronnen.slice(0, 20).map(b => ({
        naam: String(b.naam || '').slice(0, 80),
        wat: String(b.wat || '').slice(0, 120),
        url: String(b.url || '').slice(0, 400),
      }))
      : [],
    energielabel: raw.energielabel && raw.energielabel.klasse ? {
      klasse: String(raw.energielabel.klasse).slice(0, 10),
      gebouwtype: String(raw.energielabel.gebouwtype || '').slice(0, 80),
      geldigTot: String(raw.energielabel.geldigTot || '').slice(0, 40),
      opnamedatum: String(raw.energielabel.opnamedatum || '').slice(0, 40),
    } : null,
    monumenten: raw.monumenten ? {
      isMonument: !!raw.monumenten.isMonument,
      dichtstbij: raw.monumenten.dichtstbij ? {
        naam: String(raw.monumenten.dichtstbij.naam || '').slice(0, 120),
        id: String(raw.monumenten.dichtstbij.id || '').slice(0, 20),
        afstandM: raw.monumenten.dichtstbij.afstandM ?? null,
        url: String(raw.monumenten.dichtstbij.url || '').slice(0, 300),
      } : null,
      aantalInBuurt: Number(raw.monumenten.aantalInBuurt) || 0,
    } : null,
    cbs: raw.cbs ? {
      buurt: String(raw.cbs.buurt || '').slice(0, 80),
      gemeente: String(raw.cbs.gemeente || '').slice(0, 80),
      inwoners: raw.cbs.inwoners ?? null,
      huishoudens: raw.cbs.huishoudens ?? null,
      woningen: raw.cbs.woningen ?? null,
      gemWoz: raw.cbs.gemWoz ?? null,
      pctKoop: raw.cbs.pctKoop ?? null,
      pctHuur: raw.cbs.pctHuur ?? null,
    } : null,
  };
}

export async function createCheckout({ email, dossier }) {
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    const err = new Error('Geldig e-mailadres verplicht');
    err.status = 400;
    throw err;
  }
  if (!dossier?.adres) {
    const err = new Error('Dossier ontbreekt (adres)');
    err.status = 400;
    throw err;
  }

  const id = randomUUID();
  const order = saveOrder({
    id,
    email: email.trim().toLowerCase(),
    dossier: dossierSnapshot(dossier),
    status: 'pending',
    paymentMode: config.paymentMode,
    amountCents: config.priceCents,
    molliePaymentId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    paidAt: null,
    emailedAt: null,
  });

  if (config.paymentMode === 'mock') {
    return {
      orderId: order.id,
      mode: 'mock',
      checkoutUrl: `${config.publicUrl}/mock-pay.html?order=${order.id}`,
      price: priceLabel(),
    };
  }

  const payment = await mollieCreatePayment(order);
  updateOrder(order.id, { molliePaymentId: payment.id });

  return {
    orderId: order.id,
    mode: config.paymentMode,
    checkoutUrl: payment._links.checkout.href,
    price: priceLabel(),
  };
}

async function mollieCreatePayment(order) {
  const amount = (order.amountCents / 100).toFixed(2);
  const res = await fetch(`${MOLLIE_API}/payments`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.mollieApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amount: { currency: 'EUR', value: amount },
      description: `${config.productName} — ${order.dossier.adres}`,
      redirectUrl: `${config.publicUrl}/bedankt.html?order=${order.id}`,
      cancelUrl: `${config.publicUrl}/?betaaling=geannuleerd`,
      webhookUrl: `${config.publicUrl}/api/webhooks/mollie`,
      metadata: { orderId: order.id },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Mollie create payment failed: ${res.status} ${body}`);
  }
  return res.json();
}

export async function markeerBetaald(orderId, { source = 'unknown' } = {}) {
  const order = getOrder(orderId);
  if (!order) return null;
  if (order.status === 'paid') return order;

  const updated = updateOrder(orderId, {
    status: 'paid',
    paidAt: new Date().toISOString(),
    paidSource: source,
  });

  try {
    const pdfFile = await genereerPdfBestand(updated);
    updateOrder(orderId, { pdfReady: true });
    await stuurRapportMail(updated, pdfFile);
    updateOrder(orderId, { emailedAt: new Date().toISOString() });
  } catch (e) {
    console.error('PDF/mail na betaling mislukt:', e);
    updateOrder(orderId, { fulfillError: String(e.message || e) });
  }

  return getOrder(orderId);
}

export async function handleMollieWebhook(paymentId) {
  if (!paymentId) return null;

  const res = await fetch(`${MOLLIE_API}/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${config.mollieApiKey}` },
  });
  if (!res.ok) throw new Error(`Mollie get payment ${res.status}`);
  const payment = await res.json();

  const orderId = payment.metadata?.orderId;
  if (!orderId) return null;

  if (payment.status === 'paid') {
    return markeerBetaald(orderId, { source: 'mollie-webhook' });
  }

  if (['failed', 'canceled', 'expired'].includes(payment.status)) {
    return updateOrder(orderId, { status: payment.status });
  }

  return getOrder(orderId);
}

/** Mock: simuleer succesvolle betaling (alleen in mock mode). */
export async function mockPay(orderId) {
  if (config.paymentMode !== 'mock') {
    const err = new Error('Mock-betaling alleen beschikbaar in PAYMENT_MODE=mock');
    err.status = 403;
    throw err;
  }
  const order = getOrder(orderId);
  if (!order) {
    const err = new Error('Order niet gevonden');
    err.status = 404;
    throw err;
  }
  return markeerBetaald(orderId, { source: 'mock' });
}
