/**
 * Dichtstbijzijnde supermarkt vanaf lat/lon via OpenStreetMap (Overpass).
 * Inclusief bekende merken die als shop=convenience (buurtwinkel) zijn getagd.
 */
const { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } = require('fs');
const { join } = require('path');
const { DATA_DIR } = require('./paths.js');

const OVERPASS_URLS = [
  'https://overpass-api.de/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
  'https://z.overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
const UA = 'Pandloket/1.0 (https://github.com/sem020/huizen-check; supermarket POI)';
const CACHE_FILE = join(DATA_DIR, 'supermarkt-cache.json');
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const CACHE_STALE_MS = 7 * 24 * 60 * 60 * 1000;
const CACHE_MAX = 80;

/** @type {Map<string, { at: number, body: object }>} */
const memCache = new Map();

/** Merken die in NL ook als convenience/buurtwinkel voorkomen (o.a. Spar). */
const MERKEN = [
  'spar',
  'albert heijn',
  'ah to go',
  'jumbo',
  'plus',
  'coop',
  'aldi',
  'lidl',
  'dirk',
  'dekamarkt',
  'nettorama',
  'vomar',
  'hoogvliet',
  'poiesz',
  'attent',
  'mcd',
  'boni',
  'jan linders',
  'deen',
  'emté',
  'emte',
  'marqt',
  'crisp',
  'picnic',
  'amazing oriental',
];

function haversineM(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = d => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function coordsOf(el) {
  if (Number.isFinite(el.lat) && Number.isFinite(el.lon)) {
    return { lat: el.lat, lon: el.lon };
  }
  if (el.center && Number.isFinite(el.center.lat) && Number.isFinite(el.center.lon)) {
    return { lat: el.center.lat, lon: el.center.lon };
  }
  return null;
}

function naamVan(tags = {}) {
  return (
    tags.name ||
    tags.brand ||
    tags.operator ||
    tags['name:nl'] ||
    'Supermarkt'
  );
}

function tekstMerk(tags = {}) {
  return [tags.name, tags.brand, tags.operator, tags['name:nl']]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

/** Accepteer echte supermarkten + bekende boodschappenmerken als convenience. */
function isRelevanteWinkel(tags = {}) {
  const shop = String(tags.shop || '');
  if (shop === 'supermarket') return true;
  if (shop !== 'convenience' && shop !== 'grocery') return false;
  const tekst = tekstMerk(tags);
  if (!tekst.trim()) return false;
  return MERKEN.some(m => tekst.includes(m));
}

function mirrors() {
  const env = process.env.OVERPASS_URLS;
  if (env && env.trim()) return env.split(',').map(s => s.trim()).filter(Boolean);
  return OVERPASS_URLS;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isRetryable(err) {
  if (!err) return false;
  if (err.name === 'TimeoutError' || err.name === 'AbortError') return true;
  const status = err.statusCode || err.status;
  return status === 429 || status === 502 || status === 503 || status === 504;
}

async function fetchOverpass(url, body) {
  const timeoutMs = Math.min(Math.max(Number(process.env.OVERPASS_TIMEOUT_MS) || 12000, 200), 30000);
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
      'User-Agent': UA,
    },
    body,
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!r.ok) {
    const err = new Error(`Overpass ${r.status}`);
    err.statusCode = r.status;
    try { await r.arrayBuffer(); } catch { /* ignore */ }
    throw err;
  }
  return r.json();
}

async function overpassQuery(query) {
  const body = new URLSearchParams({ data: query }).toString();
  const urls = mirrors();
  let lastErr;
  let fetches = 0;
  const maxFetches = 4;
  for (let i = 0; i < urls.length && fetches < maxFetches; i++) {
    for (let attempt = 0; attempt < 2 && fetches < maxFetches; attempt++) {
      fetches++;
      try {
        return await fetchOverpass(urls[i], body);
      } catch (e) {
        lastErr = e;
        if (!isRetryable(e)) break;
        if (attempt === 0 && fetches < maxFetches) await delay(350);
      }
    }
  }
  throw lastErr || new Error('Overpass niet bereikbaar');
}

function cacheKey(lat, lon, straalM) {
  return `${lat.toFixed(3)}|${lon.toFixed(3)}|${straalM}`;
}

function remember(key, body) {
  memCache.set(key, { at: Date.now(), body });
  while (memCache.size > CACHE_MAX) {
    const oldest = memCache.keys().next().value;
    memCache.delete(oldest);
  }
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    const disk = {};
    for (const [k, v] of memCache) disk[k] = v;
    const tmp = `${CACHE_FILE}.tmp`;
    writeFileSync(tmp, JSON.stringify(disk));
    renameSync(tmp, CACHE_FILE);
  } catch (e) {
    console.warn('Supermarkt-cache niet opgeslagen:', e.message);
  }
}

function recall(key) {
  if (memCache.has(key)) return memCache.get(key);
  if (!existsSync(CACHE_FILE)) return null;
  try {
    const disk = JSON.parse(readFileSync(CACHE_FILE, 'utf8'));
    for (const [k, v] of Object.entries(disk)) {
      if (v && typeof v.at === 'number' && v.body) memCache.set(k, v);
    }
  } catch {
    return null;
  }
  return memCache.get(key) || null;
}

function leegSupermarkt(straalM) {
  return {
    supermarket: null,
    supermarkets: [],
    straalM,
    bron: 'OpenStreetMap (Overpass)',
    bronUrl: 'https://www.openstreetmap.org/',
    beschikbaar: false,
  };
}

/**
 * @param {number} lat
 * @param {number} lon
 * @param {{ straalM?: number, limiet?: number }} [opts]
 */
async function dichtstbijzijndeSupermarkt(lat, lon, opts = {}) {
  const straalM = Math.min(Math.max(Number(opts.straalM) || 1500, 300), 3000);
  const limiet = Math.min(Math.max(Number(opts.limiet) || 8, 1), 15);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    const err = new Error('lat/lon verplicht');
    err.status = 400;
    throw err;
  }

  const query = `[out:json][timeout:25];
(
  node["shop"="supermarket"](around:${straalM},${lat},${lon});
  way["shop"="supermarket"](around:${straalM},${lat},${lon});
  node["shop"="convenience"](around:${straalM},${lat},${lon});
  way["shop"="convenience"](around:${straalM},${lat},${lon});
  node["shop"="grocery"](around:${straalM},${lat},${lon});
  way["shop"="grocery"](around:${straalM},${lat},${lon});
);
out center 80;`;

  const key = cacheKey(lat, lon, straalM);
  const cached = recall(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return { ...cached.body, straalM, beschikbaar: true };
  }

  let data;
  try {
    data = await overpassQuery(query);
  } catch (e) {
    console.warn('Supermarkt:', e.message);
    if (cached && Date.now() - cached.at < CACHE_STALE_MS) {
      return { ...cached.body, straalM, beschikbaar: true };
    }
    return leegSupermarkt(straalM);
  }

  const rows = [];
  for (const el of data.elements || []) {
    const tags = el.tags || {};
    if (!isRelevanteWinkel(tags)) continue;
    const c = coordsOf(el);
    if (!c) continue;
    const afstandM = Math.round(haversineM(lat, lon, c.lat, c.lon));
    if (afstandM > straalM) continue;
    rows.push({
      naam: naamVan(tags),
      merk: tags.brand || tags.operator || null,
      shop: tags.shop || null,
      afstandM,
      lat: c.lat,
      lon: c.lon,
    });
  }

  rows.sort((a, b) => a.afstandM - b.afstandM);

  // Dedup op locatie (~25 m), zodat meerdere Albert Heijns blijven staan
  const seen = new Set();
  const uniek = [];
  for (const r of rows) {
    const key = `${Math.round(r.lat * 4000)}|${Math.round(r.lon * 4000)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    uniek.push(r);
    if (uniek.length >= limiet) break;
  }

  const result = {
    supermarket: uniek[0] || null,
    supermarkets: uniek,
    straalM,
    bron: 'OpenStreetMap (Overpass)',
    bronUrl: 'https://www.openstreetmap.org/',
    beschikbaar: true,
  };
  remember(key, result);
  return result;
}

function resetSupermarktStateForTests() {
  memCache.clear();
  for (const file of [CACHE_FILE, `${CACHE_FILE}.tmp`]) {
    try {
      if (existsSync(file)) unlinkSync(file);
    } catch { /* ignore */ }
  }
}

exports.dichtstbijzijndeSupermarkt = dichtstbijzijndeSupermarkt;
exports.resetSupermarktStateForTests = resetSupermarktStateForTests;
