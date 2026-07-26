import express from 'express';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import { config, assertPaymentConfig, priceLabel } from './config.js';
import { getOrder, pdfPath } from './store.js';
import { createCheckout, handleMollieWebhook, mockPay } from './payments.js';
import { labelOpVbo, labelOpAdres, pingEpOnline } from './ep-online.js';
import { zoekMonumenten } from './monumenten.js';
import { buurtCijfers } from './cbs.js';
import { nabijheidCijfers } from './cbs-nabijheid.js';
import { dichtstbijzijndeOv, warmOvCache } from './ov.js';
import { wozOpNummeraanduiding } from './woz.js';
import { dichtstbijzijndeSupermarkt } from './supermarkt.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

assertPaymentConfig();

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/api/health', async (_req, res) => {
  let ep = { ok: false, reason: 'no-key' };
  try { ep = await pingEpOnline(); } catch (e) { ep = { ok: false, reason: e.message }; }
  res.json({
    ok: true,
    paymentMode: config.paymentMode,
    price: priceLabel(),
    mail: config.resendApiKey ? 'resend' : 'mock',
    epOnline: ep.ok ? 'ok' : (ep.reason || 'error'),
  });
});

app.get('/api/energielabel', async (req, res) => {
  try {
    let label = null;
    if (req.query.vbo) {
      label = await labelOpVbo(req.query.vbo);
    } else if (req.query.postcode && req.query.huisnummer) {
      label = await labelOpAdres({
        postcode: req.query.postcode,
        huisnummer: req.query.huisnummer,
        huisletter: req.query.huisletter,
        toevoeging: req.query.toevoeging,
      });
    } else {
      return res.status(400).json({ error: 'Geef vbo of postcode+huisnummer mee' });
    }
    if (!label) return res.status(404).json({ error: 'Geen energielabel gevonden', label: null });
    res.json({ label });
  } catch (e) {
    console.error('EP-Online:', e.message);
    res.status(e.status || 500).json({ error: e.message || 'Energielabel ophalen mislukt' });
  }
});

app.get('/api/monumenten', async (req, res) => {
  try {
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    const straal = Number(req.query.straal) || 60;
    const data = await zoekMonumenten(lat, lon, straal);
    res.json(data);
  } catch (e) {
    console.error('Monumenten:', e.message);
    res.status(e.status || 500).json({ error: e.message || 'Monumenten ophalen mislukt' });
  }
});

app.get('/api/woz', async (req, res) => {
  try {
    const data = await wozOpNummeraanduiding(req.query.na || req.query.nummeraanduiding);
    if (!data) {
      return res.status(404).json({
        error: 'Geen WOZ-waarde gevonden voor dit adres',
        wozWaarden: [],
      });
    }
    res.json(data);
  } catch (e) {
    console.error('WOZ:', e.message);
    res.status(e.status || 500).json({ error: e.message || 'WOZ ophalen mislukt' });
  }
});

app.get('/api/cbs-buurt', async (req, res) => {
  try {
    const data = await buurtCijfers({
      buurtnaam: req.query.buurt || req.query.buurtnaam,
      gemeentecode: req.query.gemeentecode,
      gemeentenaam: req.query.gemeente,
    });
    if (!data) return res.status(404).json({ error: 'Geen CBS-buurtcijfers gevonden', buurt: null });
    res.json({ buurt: data });
  } catch (e) {
    console.error('CBS:', e.message);
    res.status(e.status || 500).json({ error: e.message || 'CBS ophalen mislukt' });
  }
});

app.get('/api/cbs-nabijheid', async (req, res) => {
  try {
    const data = await nabijheidCijfers({
      buurtnaam: req.query.buurt || req.query.buurtnaam,
      gemeentecode: req.query.gemeentecode,
      gemeentenaam: req.query.gemeente,
    });
    if (!data) return res.status(404).json({ error: 'Geen CBS-nabijheid gevonden', nabijheid: null });
    res.json({ nabijheid: data });
  } catch (e) {
    console.error('CBS nabijheid:', e.message);
    res.status(e.status || 500).json({ error: e.message || 'CBS nabijheid ophalen mislukt' });
  }
});

app.get('/api/ov-dichtbij', async (req, res) => {
  try {
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    const data = await dichtstbijzijndeOv(lat, lon, {
      limiet: Number(req.query.limiet) || 5,
      straalM: Number(req.query.straal) || 1500,
    });
    res.json(data);
  } catch (e) {
    console.error('OV:', e.message);
    res.status(e.status || 500).json({ error: e.message || 'OV-halten ophalen mislukt' });
  }
});

app.get('/api/supermarkt-dichtbij', async (req, res) => {
  try {
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    const data = await dichtstbijzijndeSupermarkt(lat, lon, {
      straalM: Number(req.query.straal) || 1500,
      limiet: Number(req.query.limiet) || 8,
    });
    res.json(data);
  } catch (e) {
    console.error('Supermarkt:', e.message);
    res.status(e.status || 500).json({ error: e.message || 'Supermarkt ophalen mislukt' });
  }
});

app.post('/api/checkout', async (req, res) => {
  try {
    const result = await createCheckout({
      email: req.body?.email,
      dossier: req.body?.dossier,
    });
    res.json(result);
  } catch (e) {
    console.error(e);
    res.status(e.status || 500).json({ error: e.message || 'Checkout mislukt' });
  }
});

app.post('/api/mock-pay/:orderId', async (req, res) => {
  try {
    const order = await mockPay(req.params.orderId);
    res.json({
      ok: true,
      orderId: order.id,
      status: order.status,
      redirectUrl: `${config.publicUrl}/bedankt.html?order=${order.id}`,
    });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || 'Mock-betaling mislukt' });
  }
});

app.post('/api/webhooks/mollie', async (req, res) => {
  try {
    const paymentId = req.body?.id;
    await handleMollieWebhook(paymentId);
    res.status(200).send('OK');
  } catch (e) {
    console.error('Webhook fout:', e);
    res.status(500).send('error');
  }
});

app.get('/api/orders/:id', (req, res) => {
  const order = getOrder(req.params.id);
  if (!order) return res.status(404).json({ error: 'Niet gevonden' });
  res.json({
    id: order.id,
    status: order.status,
    email: order.email,
    adres: order.dossier?.adres,
    plaats: order.dossier?.plaats,
    paidAt: order.paidAt,
    pdfReady: !!order.pdfReady || existsSync(pdfPath(order.id)),
    paymentMode: order.paymentMode,
  });
});

app.get('/api/orders/:id/pdf', (req, res) => {
  const order = getOrder(req.params.id);
  if (!order) return res.status(404).send('Niet gevonden');
  if (order.status !== 'paid') return res.status(402).send('Nog niet betaald');

  const file = pdfPath(order.id);
  if (!existsSync(file)) return res.status(404).send('PDF nog niet klaar');

  const naam = `pandloket-${(order.dossier?.adres || 'rapport')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.pdf`;
  res.download(file, naam);
});

app.use(express.static(root, {
  extensions: ['html'],
  setHeaders(res, path) {
    if (path.endsWith('.js') || path.endsWith('.css') || path.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  },
}));

app.listen(config.port, () => {
  console.log('');
  console.log(`Pandloket server → ${config.publicUrl}`);
  console.log(`  betaling: ${config.paymentMode}`);
  console.log(`  prijs:    € ${priceLabel()}`);
  console.log(`  e-mail:   ${config.resendApiKey ? 'Resend' : 'mock (console)'}`);
  console.log(`  EP-Online:${config.epOnlineApiKey ? ' geconfigureerd' : ' geen key'}`);
  console.log('');
  if (config.paymentMode === 'mock') {
    console.log('  Tip: open de site, zoek een adres, bestel PDF.');
    console.log('  Mock-betaling vraagt geen Mollie-account.');
    console.log('');
  }
  warmOvCache();
});
