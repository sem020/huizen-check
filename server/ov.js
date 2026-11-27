/**
 * Dichtstbijzijnde OV-halten.
 *
 * Het volledige GTFS-nl-archief is ~300 MB en OVapi antwoordt bij herhaalde
 * downloads met 429. Shared hosting herstart het proces na een paar minuten
 * idle, dus een download bij elke cold start houdt die limiet in stand.
 *
 * Daarom:
 * - een CC0-subset van stops.txt zit in de deploy (server/data/ov-stops.txt.gz)
 * - een nieuwere kopie in DATA_DIR wint van die bundel
 * - een request leest alleen lokale data en antwoordt leeg als die ontbreekt
 * - verversen gebeurt op de achtergrond, met backoff, en stopt bij 429
 *   (geen tweede URL op dezelfde host)
 * - de GOVI-zip is geen haltebron: die bevat alleen agency.txt en
 *   calendar_dates.txt (gecontroleerd 27 nov 2026). stops.txt in een submap
 *   wordt wel gevonden, voor het geval een feed niet op zip-root ligt.
 */
const {
  existsSync, mkdirSync, readFileSync, statSync, writeFileSync, unlinkSync, renameSync,
} = require('fs');
const { join, resolve, sep } = require('path');
const { tmpdir } = require('os');
const zlib = require('zlib');
const { DATA_DIR } = require('./paths.js');

const STOPS_PATH = join(DATA_DIR, 'stops.txt');
const META_PATH = join(DATA_DIR, 'ov-meta.json');
const BACKOFF_PATH = join(DATA_DIR, 'ov-refresh.json');
const BUNDLED_STOPS = join(__dirname, 'data', 'ov-stops.txt.gz');
const BUNDLED_META = join(__dirname, 'data', 'ov-stops-meta.json');

const GTFS_URL = 'https://gtfs.ovapi.nl/gtfs-nl.zip';
const OPENOV_URL = 'https://gtfs.ovapi.nl/openov-nl/gtfs-openov-nl.zip';
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const MIN_BACKOFF_MS = 30 * 60 * 1000;
const MAX_BACKOFF_MS = 24 * 60 * 60 * 1000;
const UA = 'Pandloket/1.0 (https://github.com/sem020/huizen-check; OV-halten cache)';

/** @type {{ lat: number, lon: number, name: string, id: string, station?: boolean }[] | null} */
let stopsCache = null;
let loadedMeta = null;
let loadPromise = null;
let refreshPromise = null;
let refreshScheduled = false;

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

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQ = false;
      } else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out;
}

function normalizeName(name) {
  return String(name || '')
    .replace(/\s*\(Perron[^)]*\)\s*$/i, '')
    .replace(/\s*\(Spoor[^)]*\)\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Dedup-key: "Amsterdam, Dam" en "Dam" → "dam" */
function halteKey(name) {
  const n = normalizeName(name).toLowerCase();
  const i = n.lastIndexOf(',');
  return (i >= 0 ? n.slice(i + 1) : n).trim();
}

function detectSoort(name) {
  const n = name.toLowerCase();
  if (/\b(station|centraal)\b/.test(n) && !/bushalte|tram/.test(n)) return 'trein';
  if (/\bmetro\b|\b(metrohalte)\b/.test(n)) return 'metro';
  if (/\btram\b/.test(n)) return 'tram';
  if (/\bbus\b|bushalte/.test(n)) return 'bus';
  return 'ov';
}

function parseStopsFile(text) {
  const lines = String(text || '').split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const header = parseCsvLine(lines[0]);
  const idx = Object.fromEntries(header.map((h, i) => [h.trim(), i]));
  const iLat = idx.stop_lat;
  const iLon = idx.stop_lon;
  const iName = idx.stop_name;
  const iId = idx.stop_id;
  const iType = idx.location_type;
  if (iLat == null || iLon == null || iName == null) return [];

  const stops = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const lat = Number(cols[iLat]);
    const lon = Number(cols[iLon]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    if (lat < 50.5 || lat > 53.7 || lon < 3.2 || lon > 7.4) continue;
    const locType = iType != null ? String(cols[iType] || '0') : '0';
    if (locType === '2' || locType === '3' || locType === '4') continue;
    const name = normalizeName(cols[iName]);
    if (!name) continue;
    stops.push({
      id: String(cols[iId] || i),
      name,
      lat,
      lon,
      station: locType === '1',
    });
  }
  return stops;
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function bundleStopsPath() {
  if (Object.prototype.hasOwnProperty.call(process.env, 'OV_BUNDLE_PATH')) {
    return process.env.OV_BUNDLE_PATH || '';
  }
  return BUNDLED_STOPS;
}

function bundleMetaPath() {
  return process.env.OV_BUNDLE_META || BUNDLED_META;
}

function readBundledText() {
  const path = bundleStopsPath();
  if (!path || !existsSync(path)) return '';
  try {
    const buf = readFileSync(path);
    const text = path.endsWith('.gz') ? zlib.gunzipSync(buf).toString('utf8') : buf.toString('utf8');
    return text;
  } catch (e) {
    console.warn('OV-bundel onleesbaar:', e.message);
    return '';
  }
}

function stampOf(meta, filePath) {
  const parsed = Date.parse(meta?.updatedAt || '');
  if (Number.isFinite(parsed)) return parsed;
  try {
    return statSync(filePath).mtimeMs;
  } catch {
    return 0;
  }
}

function loadBestStops() {
  let best = [];
  let bestMeta = null;
  let bestSource = 'none';
  let bestStamp = 0;

  const bundledText = readBundledText();
  if (bundledText) {
    const parsed = parseStopsFile(bundledText);
    if (parsed.length) {
      best = parsed;
      bestMeta = readJson(bundleMetaPath());
      bestSource = 'bundle';
      bestStamp = stampOf(bestMeta, bundleStopsPath());
    }
  }

  if (existsSync(STOPS_PATH) && statSync(STOPS_PATH).size > 40) {
    try {
      const parsed = parseStopsFile(readFileSync(STOPS_PATH, 'utf8'));
      if (parsed.length) {
        const meta = readJson(META_PATH);
        const stamp = stampOf(meta, STOPS_PATH);
        if (!best.length || stamp >= bestStamp) {
          best = parsed;
          bestMeta = meta;
          bestSource = 'cache';
          bestStamp = stamp;
        }
      }
    } catch (e) {
      console.warn('OV-cache onleesbaar:', e.message);
    }
  }

  return { stops: best, meta: bestMeta, source: bestSource, stamp: bestStamp };
}

function localIsFresh(loaded) {
  if (!loaded?.stops?.length) return false;
  if (!loaded.stamp) return loaded.source === 'bundle';
  return Date.now() - loaded.stamp < MAX_AGE_MS;
}

function dataDirIsEphemeral() {
  if (process.env.OV_DATA_EPHEMERAL === '1') return true;
  if (process.env.OV_DATA_EPHEMERAL === '0') return false;
  const dir = resolve(DATA_DIR);
  const tmp = resolve(tmpdir());
  return dir === tmp || dir.startsWith(tmp + sep);
}

function readBackoff() {
  return readJson(BACKOFF_PATH);
}

function writeBackoff(state) {
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    const tmp = `${BACKOFF_PATH}.tmp`;
    writeFileSync(tmp, JSON.stringify(state));
    renameSync(tmp, BACKOFF_PATH);
  } catch (e) {
    console.warn('OV-backoff niet opgeslagen:', e.message);
  }
}

function writeCache(text, meta) {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${STOPS_PATH}.tmp`;
  writeFileSync(tmp, text);
  renameSync(tmp, STOPS_PATH);
  writeFileSync(META_PATH, JSON.stringify(meta, null, 2));
}

function gtfsUrls() {
  const env = process.env.OV_GTFS_URLS;
  if (env && env.trim()) return env.split(',').map(s => s.trim()).filter(Boolean);
  return [GTFS_URL, OPENOV_URL];
}

function httpErr(res, label) {
  const err = new Error(`${label} ${res.status}`);
  err.statusCode = res.status;
  const ra = res.headers.get('retry-after');
  if (ra) {
    const secs = Number(ra);
    if (Number.isFinite(secs)) err.retryAfterMs = Math.max(0, secs * 1000);
    else {
      const when = Date.parse(ra);
      if (Number.isFinite(when)) err.retryAfterMs = Math.max(0, when - Date.now());
    }
  }
  return err;
}

async function drain(res) {
  try {
    if (res?.body?.cancel) await res.body.cancel();
    else if (res) await res.arrayBuffer();
  } catch { /* ignore */ }
}

function findSig(buf, sig, fromEnd = true) {
  if (fromEnd) {
    for (let i = buf.length - 4; i >= 0; i--) {
      if (buf.readUInt32LE(i) === sig) return i;
    }
    return -1;
  }
  for (let i = 0; i <= buf.length - 4; i++) {
    if (buf.readUInt32LE(i) === sig) return i;
  }
  return -1;
}

function parseCentralDirectory(cd) {
  const entries = [];
  let pos = 0;
  while (pos + 46 <= cd.length) {
    if (cd.readUInt32LE(pos) !== 0x02014b50) break;
    let compSize = cd.readUInt32LE(pos + 20);
    let uncompSize = cd.readUInt32LE(pos + 24);
    const nameLen = cd.readUInt16LE(pos + 28);
    const extraLen = cd.readUInt16LE(pos + 30);
    const commentLen = cd.readUInt16LE(pos + 32);
    let localOffset = cd.readUInt32LE(pos + 42);
    const nameStart = pos + 46;
    const name = cd.subarray(nameStart, nameStart + nameLen).toString('utf8');
    const extra = cd.subarray(nameStart + nameLen, nameStart + nameLen + extraLen);
    if (compSize === 0xFFFFFFFF || uncompSize === 0xFFFFFFFF || localOffset === 0xFFFFFFFF) {
      let ep = 0;
      while (ep + 4 <= extra.length) {
        const hid = extra.readUInt16LE(ep);
        const hsz = extra.readUInt16LE(ep + 2);
        const payload = extra.subarray(ep + 4, ep + 4 + hsz);
        ep += 4 + hsz;
        if (hid !== 1) continue;
        let pp = 0;
        const take = () => {
          const n = Number(payload.readBigUInt64LE(pp));
          pp += 8;
          return n;
        };
        if (uncompSize === 0xFFFFFFFF && pp + 8 <= payload.length) uncompSize = take();
        if (compSize === 0xFFFFFFFF && pp + 8 <= payload.length) compSize = take();
        if (localOffset === 0xFFFFFFFF && pp + 8 <= payload.length) localOffset = take();
      }
    }
    entries.push({ name, compSize, localOffset });
    pos += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function pickStopsEntry(entries) {
  const hits = entries.filter(e => /(^|[/\\])stops\.txt$/i.test(String(e.name || '')));
  hits.sort((a, b) => {
    const depth = name => (String(name).includes('/') || String(name).includes('\\') ? 1 : 0);
    return depth(a.name) - depth(b.name) || String(a.name).length - String(b.name).length;
  });
  return hits[0] || null;
}

function decodeLocalEntry(blob, entry) {
  if (blob.length < 30 || blob.readUInt32LE(0) !== 0x04034b50) {
    throw new Error('GTFS local header ongeldig');
  }
  const method = blob.readUInt16LE(8);
  const nameLen = blob.readUInt16LE(26);
  const extraLen = blob.readUInt16LE(28);
  const start = 30 + nameLen + extraLen;
  const comp = blob.subarray(start, start + entry.compSize);
  if (comp.length < entry.compSize) throw new Error('GTFS stops-entry afgekapt');
  if (method === 0) return comp.toString('utf8');
  if (method === 8) return zlib.inflateRawSync(comp).toString('utf8');
  throw new Error(`GTFS compressie ${method} niet ondersteund`);
}

/** Pak stops.txt uit een volledig zip-bestand, ook als het in een submap staat. */
function extractStopsFromZipBuffer(buf) {
  const eocd = findSig(buf, 0x06054b50);
  if (eocd < 0) throw new Error('GTFS zip zonder centrale directory');
  let cdSize = buf.readUInt32LE(eocd + 12);
  let cdOffset = buf.readUInt32LE(eocd + 16);
  if (cdOffset === 0xFFFFFFFF || cdSize === 0xFFFFFFFF) {
    const loc = findSig(buf.subarray(0, eocd), 0x07064b50);
    if (loc < 0) throw new Error('GTFS zip64 locator ontbreekt');
    const z64off = Number(buf.readBigUInt64LE(loc + 8));
    if (buf.readUInt32LE(z64off) !== 0x06064b50) throw new Error('GTFS zip64 EOCD ongeldig');
    cdSize = Number(buf.readBigUInt64LE(z64off + 40));
    cdOffset = Number(buf.readBigUInt64LE(z64off + 48));
  }
  const entries = parseCentralDirectory(buf.subarray(cdOffset, cdOffset + cdSize));
  const entry = pickStopsEntry(entries);
  if (!entry) {
    const err = new Error('geen stops.txt in zip');
    err.code = 'NO_STOPS';
    throw err;
  }
  return decodeLocalEntry(buf.subarray(entry.localOffset), entry);
}

async function fetchRange(url, start, end) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Range: `bytes=${start}-${end}` },
    signal: AbortSignal.timeout(60_000),
  });
  if (res.status === 429 || res.status === 503 || res.status === 403) {
    const err = httpErr(res, 'GTFS download');
    await drain(res);
    throw err;
  }
  if (res.status !== 206) {
    await drain(res);
    const err = new Error(`GTFS range ${res.status}`);
    err.statusCode = res.status;
    throw err;
  }
  return Buffer.from(await res.arrayBuffer());
}

async function remoteSize(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Range: 'bytes=0-0' },
    signal: AbortSignal.timeout(20_000),
  });
  if (res.status === 429 || res.status === 503 || res.status === 403) {
    const err = httpErr(res, 'GTFS download');
    await drain(res);
    throw err;
  }
  const match = (res.headers.get('content-range') || '').match(/\/(\d+)\s*$/);
  await drain(res);
  if (res.status === 206 && match) return Number(match[1]);
  throw new Error(`GTFS grootte onbekend (${res.status})`);
}

async function downloadStopsByRange(url, total) {
  const tailLen = Math.min(total, 66_000);
  const tail = await fetchRange(url, total - tailLen, total - 1);
  const eocdRel = findSig(tail, 0x06054b50);
  if (eocdRel < 0) throw new Error('GTFS zip zonder centrale directory');
  let cdSize = tail.readUInt32LE(eocdRel + 12);
  let cdOffset = tail.readUInt32LE(eocdRel + 16);
  if (cdOffset === 0xFFFFFFFF || cdSize === 0xFFFFFFFF || tail.readUInt16LE(eocdRel + 10) === 0xFFFF) {
    const locRel = findSig(tail.subarray(0, eocdRel), 0x07064b50);
    if (locRel < 0) throw new Error('GTFS zip64 locator ontbreekt');
    const z64off = Number(tail.readBigUInt64LE(locRel + 8));
    const z64 = await fetchRange(url, z64off, z64off + 160);
    if (z64.readUInt32LE(0) !== 0x06064b50) throw new Error('GTFS zip64 EOCD ongeldig');
    cdSize = Number(z64.readBigUInt64LE(40));
    cdOffset = Number(z64.readBigUInt64LE(48));
  }
  if (cdSize <= 0 || cdSize > 5_000_000) throw new Error('GTFS centrale directory onbruikbaar');
  const cd = await fetchRange(url, cdOffset, cdOffset + cdSize - 1);
  const entry = pickStopsEntry(parseCentralDirectory(cd));
  if (!entry) {
    const err = new Error('geen stops.txt in zip');
    err.code = 'NO_STOPS';
    throw err;
  }
  if (entry.compSize <= 0 || entry.compSize > 30 * 1024 * 1024) {
    throw new Error('stops.txt heeft een onbruikbare grootte');
  }
  const slack = 30 + 1024 + entry.compSize;
  const blob = await fetchRange(url, entry.localOffset, entry.localOffset + slack - 1);
  return decodeLocalEntry(blob, entry);
}

async function downloadStopsText(url) {
  const total = await remoteSize(url);
  return downloadStopsByRange(url, total);
}

async function refreshStopsCache() {
  const urls = gtfsUrls();
  let lastErr;
  for (const url of urls) {
    try {
      const text = await downloadStopsText(url);
      const parsed = parseStopsFile(text);
      if (!parsed.length) throw new Error('GTFS stops.txt bevatte geen halten');
      const meta = {
        source: 'gtfs',
        url,
        updatedAt: new Date().toISOString(),
        stops: parsed.length,
        license: 'CC0-1.0',
      };
      writeCache(text, meta);
      return text;
    } catch (e) {
      lastErr = e;
      console.warn(`OV-download mislukt (${url}):`, e.message);
      if (e.statusCode === 429 || e.statusCode === 503) break;
    }
  }
  throw lastErr || new Error('GTFS download mislukt');
}

function backoffWait(err, failCount) {
  if (err?.statusCode === 429 || err?.statusCode === 503) {
    const floor = 60 * 60 * 1000 * Math.min(Math.max(failCount, 1), 24);
    return Math.min(MAX_BACKOFF_MS, Math.max(err.retryAfterMs || 0, floor));
  }
  const exp = MIN_BACKOFF_MS * 2 ** Math.min(Math.max(failCount, 1), 6);
  return Math.min(MAX_BACKOFF_MS, Math.max(err?.retryAfterMs || 0, exp));
}

async function maybeRefreshStops() {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    if (process.env.OV_REFRESH === '0') return { skipped: 'disabled' };
    const loaded = stopsCache ? { stops: stopsCache, meta: loadedMeta, source: 'memory', stamp: stampOf(loadedMeta, STOPS_PATH) } : loadBestStops();
    if (localIsFresh(loaded)) return { skipped: 'fresh' };
    if (dataDirIsEphemeral() && loaded.stops.length && loaded.source !== 'cache') {
      return { skipped: 'ephemeral' };
    }
    const gate = readBackoff();
    if (gate && Date.now() < Number(gate.nextAttemptAt || 0)) {
      return { skipped: 'backoff', nextAttemptAt: gate.nextAttemptAt };
    }
    const prevFails = Number(gate?.failCount || 0);
    writeBackoff({
      nextAttemptAt: Date.now() + MIN_BACKOFF_MS,
      failCount: prevFails,
      reason: 'in-progress',
    });
    try {
      const text = await refreshStopsCache();
      const parsed = parseStopsFile(text);
      stopsCache = parsed;
      loadedMeta = readJson(META_PATH);
      writeBackoff({
        nextAttemptAt: Date.now() + MAX_AGE_MS,
        failCount: 0,
        reason: 'ok',
      });
      console.log(`OV-stops vernieuwd: ${parsed.length}`);
      return { ok: true, count: parsed.length };
    } catch (e) {
      const failCount = prevFails + 1;
      const wait = backoffWait(e, failCount);
      writeBackoff({
        nextAttemptAt: Date.now() + wait,
        failCount,
        reason: e.message,
        status: e.statusCode || null,
      });
      console.warn('OV-stops refresh mislukt:', e.message);
      return { ok: false, error: e.message, status: e.statusCode || null };
    }
  })().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

function scheduleRefresh() {
  if (refreshScheduled || process.env.OV_REFRESH === '0') return;
  refreshScheduled = true;
  const delayMs = Number(process.env.OV_REFRESH_DELAY_MS);
  const timer = setTimeout(() => {
    maybeRefreshStops().catch(e => console.warn('OV-refresh:', e.message));
  }, Number.isFinite(delayMs) ? delayMs : 5_000);
  if (typeof timer.unref === 'function') timer.unref();
}

async function ensureStopsLoaded() {
  if (stopsCache) return stopsCache;
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    const loaded = loadBestStops();
    stopsCache = loaded.stops;
    loadedMeta = loaded.meta;
    console.log(`OV-stops geladen: ${stopsCache.length} (${loaded.source})`);
    scheduleRefresh();
    return stopsCache;
  })();
  try {
    return await loadPromise;
  } finally {
    loadPromise = null;
  }
}

function leegResultaat(straalM) {
  return {
    halten: [],
    straalM,
    bron: 'OVapi GTFS (OpenOV)',
    bronUrl: 'https://gtfs.ovapi.nl/',
    bijgewerkt: loadedMeta?.updatedAt || null,
    beschikbaar: false,
  };
}

/**
 * @param {number} lat
 * @param {number} lon
 * @param {{ limiet?: number, straalM?: number }} [opts]
 */
async function dichtstbijzijndeOv(lat, lon, opts = {}) {
  const limiet = Math.min(Math.max(Number(opts.limiet) || 5, 1), 15);
  const straalM = Math.min(Math.max(Number(opts.straalM) || 1500, 200), 5000);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    const err = new Error('lat/lon verplicht');
    err.status = 400;
    throw err;
  }

  let stops = [];
  try {
    stops = await ensureStopsLoaded();
  } catch (e) {
    console.warn('OV:', e.message);
    return leegResultaat(straalM);
  }
  if (!stops.length) return leegResultaat(straalM);

  const dLat = (straalM * 1.2) / 111320;
  const dLon = (straalM * 1.2) / (111320 * Math.cos((lat * Math.PI) / 180));

  const candidates = [];
  for (const s of stops) {
    if (Math.abs(s.lat - lat) > dLat || Math.abs(s.lon - lon) > dLon) continue;
    const afstandM = Math.round(haversineM(lat, lon, s.lat, s.lon));
    if (afstandM > straalM) continue;
    candidates.push({ ...s, afstandM });
  }
  candidates.sort((a, b) => a.afstandM - b.afstandM);

  const seen = new Set();
  const halten = [];
  for (const c of candidates) {
    const key = halteKey(c.name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    halten.push({
      naam: c.name,
      afstandM: c.afstandM,
      lat: c.lat,
      lon: c.lon,
      soort: detectSoort(c.name),
    });
    if (halten.length >= limiet) break;
  }

  return {
    halten,
    straalM,
    bron: 'OVapi GTFS (OpenOV)',
    bronUrl: 'https://gtfs.ovapi.nl/',
    bijgewerkt: loadedMeta?.updatedAt || null,
    beschikbaar: true,
  };
}

/** Warm cache at server start (non-blocking). */
function warmOvCache() {
  ensureStopsLoaded()
    .then(() => maybeRefreshStops())
    .catch(e => console.warn('OV warm-up:', e.message));
}

function forgetOvMemoryForTests() {
  stopsCache = null;
  loadedMeta = null;
  loadPromise = null;
  refreshPromise = null;
  refreshScheduled = false;
}

function resetOvStateForTests() {
  forgetOvMemoryForTests();
  for (const file of [STOPS_PATH, META_PATH, BACKOFF_PATH, `${STOPS_PATH}.tmp`, `${BACKOFF_PATH}.tmp`]) {
    try {
      if (existsSync(file)) unlinkSync(file);
    } catch { /* ignore */ }
  }
}

exports.dichtstbijzijndeOv = dichtstbijzijndeOv;
exports.warmOvCache = warmOvCache;
exports.parseStopsFile = parseStopsFile;
exports.extractStopsFromZipBuffer = extractStopsFromZipBuffer;
exports.maybeRefreshStops = maybeRefreshStops;
exports.resetOvStateForTests = resetOvStateForTests;
exports.forgetOvMemoryForTests = forgetOvMemoryForTests;
