/**
 * Dichtstbijzijnde supermarkt vanaf lat/lon via OpenStreetMap (Overpass).
 * Inclusief bekende merken die als shop=convenience (buurtwinkel) zijn getagd.
 */
const OVERPASS_URLS = [
  'https://overpass-api.de/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
];
const UA = 'Pandloket/1.0 (https://github.com/sem020/huizen-check; supermarket POI)';

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

async function overpassQuery(query) {
  const body = new URLSearchParams({ data: query }).toString();
  let lastErr;
  for (const url of OVERPASS_URLS) {
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
          'User-Agent': UA,
        },
        body,
        signal: AbortSignal.timeout(28000),
      });
      if (!r.ok) {
        lastErr = new Error(`Overpass ${r.status}`);
        continue;
      }
      return await r.json();
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('Overpass niet bereikbaar');
}

/**
 * @param {number} lat
 * @param {number} lon
 * @param {{ straalM?: number, limiet?: number }} [opts]
 */
export async function dichtstbijzijndeSupermarkt(lat, lon, opts = {}) {
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

  const data = await overpassQuery(query);
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

  return {
    supermarket: uniek[0] || null,
    supermarkets: uniek,
    straalM,
    bron: 'OpenStreetMap (Overpass)',
    bronUrl: 'https://www.openstreetmap.org/',
  };
}
