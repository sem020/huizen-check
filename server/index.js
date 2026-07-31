const express = require('express');
const { join } = require('path');
const { existsSync } = require('fs');
const { config, assertPaymentConfig, priceLabel } = require('./config.js');
const { getOrder, pdfPath } = require('./store.js');
const { createCheckout, handleMollieWebhook, mockPay } = require('./payments.js');
const { labelOpVbo, labelOpAdres, pingEpOnline } = require('./ep-online.js');
const { zoekMonumenten } = require('./monumenten.js');
const { buurtCijfers } = require('./cbs.js');
const { nabijheidCijfers } = require('./cbs-nabijheid.js');
const { dichtstbijzijndeOv, warmOvCache } = require('./ov.js');
const { wozOpNummeraanduiding } = require('./woz.js');
const { dichtstbijzijndeSupermarkt } = require('./supermarkt.js');
const { renderIndex, unslug, sitemapXml, robotsTxt } = require('./seo.js');
const root = join(__dirname, '..');

assertPaymentConfig();

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/robots.txt', (_req, res) => {
  res.type('text/plain').send(robotsTxt(config.publicUrl));
});

app.get('/sitemap.xml', (_req, res) => {
  res.type('application/xml').send(sitemapXml(config.publicUrl));
});

/** Oude .html-URL’s → schone paden (SEO). */
for (const [from, to] of [
  ['/over.html', '/over'],
  ['/privacy.html', '/privacy'],
  ['/av.html', '/av'],
  ['/bedankt.html', '/bedankt'],
  ['/mock-pay.html', '/mock-pay'],
]) {
  app.get(from, (_req, res) => res.redirect(301, to));
}

/** SEO-vriendelijke pand-URL’s: /pand/straat-huisnummer-plaats?id=… */
app.get('/pand/:slug', (req, res) => {
  const label = unslug(req.params.slug) || 'Adres';
  const id = req.query.id ? `?id=${encodeURIComponent(String(req.query.id))}` : '';
  const canonical = `${config.publicUrl}/pand/${req.params.slug}${id}`;
  const html = renderIndex(root, {
    title: `${label} — Pandloket`,
    description: `Openbare gegevens over ${label}: bouwjaar, WOZ-waarde, energielabel, buurtcijfers en meer uit officiële registers.`,
    canonical,
    placeName: label,
  });
  res.type('html').send(html);
});

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

// Eerst proberen op HOST (default 0.0.0.0); bij EADDRNOTAVAIL zonder host.
function startListening(host) {
  const args = host ? [config.port, host] : [config.port];
  const server = app.listen(...args, () => {
    console.log('');
    console.log(`Pandloket server → ${config.publicUrl}`);
    console.log(`  listen:   ${host || 'default'}:${config.port}`);
    console.log(`  betaling: ${config.paymentMode}`);
    console.log(`  prijs:    € ${priceLabel()}`);
    console.log(`  e-mail:   ${config.resendApiKey ? 'Resend' : 'mock (console)'}`);
    console.log(`  EP-Online:${config.epOnlineApiKey ? ' geconfigureerd' : ' geen key'}`);
    console.log('');
    // Uitstellen: GTFS-download bij start kan shared plans OOM'en → 503.
    setTimeout(() => warmOvCache(), 30_000);
  });

  server.on('error', (err) => {
    if (host && (err.code === 'EADDRNOTAVAIL' || err.code === 'EINVAL')) {
      console.warn(`Listen op ${host} mislukt (${err.code}), opnieuw zonder host…`);
      startListening(null);
      return;
    }
    console.error('Server start mislukt:', err);
    process.exit(1);
  });
}

startListening(config.host);
