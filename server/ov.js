/**
 * Dichtstbijzijnde OV-halten via OVapi GTFS stops.txt (gecached).
 * Bron: https://gtfs.ovapi.nl/ — Bus/Tram/Metro/Trein.
 */
import { createWriteStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { pipeline } from 'stream/promises';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { tmpdir } from 'os';

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const STOPS_PATH = join(DATA_DIR, 'stops.txt');
const META_PATH = join(DATA_DIR, 'ov-meta.json');

const GTFS_URL = 'https://gtfs.ovapi.nl/gtfs-nl.zip';
const GOVI_INDEX = 'https://gtfs.ovapi.nl/govi/';
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const UA = 'Pandloket/1.0 (https://github.com/sem020/huizen-check; OV-halten cache)';


/** @type {{ lat: number, lon: number, name: string, id: string }[] | null} */
let stopsCache = null;
let loadPromise = null;

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
  const lines = text.split(/\r?\n/).filter(Boolean);
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
    // Filter nonsense / foreign coords
    if (lat < 50.5 || lat > 53.7 || lon < 3.2 || lon > 7.4) continue;
    const locType = iType != null ? String(cols[iType] || '0') : '0';
    // Skip station entrances / generic nodes; keep stops (0) and stations (1)
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

function cacheIsFresh() {
  if (!existsSync(STOPS_PATH)) return false;
  try {
    const age = Date.now() - statSync(STOPS_PATH).mtimeMs;
    return age < MAX_AGE_MS && statSync(STOPS_PATH).size > 50_000;
  } catch {
    return false;
  }
}

async function downloadZip(url, dest) {
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`GTFS download ${r.status}`);
  await pipeline(r.body, createWriteStream(dest));
}

async function latestGoviUrl() {
  const r = await fetch(GOVI_INDEX, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`govi index ${r.status}`);
  const html = await r.text();
  const matches = [...html.matchAll(/href="(gtfs-kv7-\d+\.zip)"/g)].map(m => m[1]);
  if (!matches.length) throw new Error('geen govi zip gevonden');
  matches.sort();
  return GOVI_INDEX + matches[matches.length - 1];
}

async function extractStopsFromZip(zipPath) {
  // Prefer system unzip (macOS/Linux)
  try {
    const { stdout } = await execFileAsync('unzip', ['-p', zipPath, 'stops.txt'], {
      maxBuffer: 80 * 1024 * 1024,
      encoding: 'buffer',
    });
    return Buffer.isBuffer(stdout) ? stdout.toString('utf8') : String(stdout);
  } catch (e) {
    throw new Error(`Kon stops.txt niet uitpakken: ${e.message}`);
  }
}

async function refreshStopsCache() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

  const zipPath = join(tmpdir(), `pandloket-gtfs-${Date.now()}.zip`);
  let source = 'gtfs-nl';
  let url = GTFS_URL;
  try {
    try {
      await downloadZip(GTFS_URL, zipPath);
    } catch (e) {
      console.warn('Volledige GTFS mislukt, probeer govi:', e.message);
      source = 'govi';
      url = await latestGoviUrl();
      await downloadZip(url, zipPath);
    }
    const text = await extractStopsFromZip(zipPath);
    writeFileSync(STOPS_PATH, text, 'utf8');
    writeFileSync(
      META_PATH,
      JSON.stringify({ source, updatedAt: new Date().toISOString(), url }, null, 2),
    );
    return text;
  } finally {
    try {
      if (existsSync(zipPath)) unlinkSync(zipPath);
    } catch { /* ignore */ }
  }
}

async function ensureStopsLoaded() {
  if (stopsCache) return stopsCache;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    let text;
    if (cacheIsFresh()) {
      text = readFileSync(STOPS_PATH, 'utf8');
    } else if (existsSync(STOPS_PATH) && statSync(STOPS_PATH).size > 10_000) {
      // Stale but usable — serve now, refresh in background
      text = readFileSync(STOPS_PATH, 'utf8');
      refreshStopsCache()
        .then(t => {
          stopsCache = parseStopsFile(t);
          console.log(`OV-stops vernieuwd: ${stopsCache.length}`);
        })
        .catch(e => console.warn('OV-stops refresh mislukt:', e.message));
    } else {
      text = await refreshStopsCache();
    }
    stopsCache = parseStopsFile(text);
    console.log(`OV-stops geladen: ${stopsCache.length}`);
    return stopsCache;
  })();

  try {
    return await loadPromise;
  } finally {
    loadPromise = null;
  }
}

/**
 * @param {number} lat
 * @param {number} lon
 * @param {{ limiet?: number, straalM?: number }} [opts]
 */
export async function dichtstbijzijndeOv(lat, lon, opts = {}) {
  const limiet = Math.min(Math.max(Number(opts.limiet) || 5, 1), 15);
  const straalM = Math.min(Math.max(Number(opts.straalM) || 1500, 200), 5000);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    const err = new Error('lat/lon verplicht');
    err.status = 400;
    throw err;
  }

  const stops = await ensureStopsLoaded();
  // Rough degree bbox (~straal + marge)
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

  // Dedup by halte-naam (platforms + parent station → één entry)
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

  let meta = null;
  if (existsSync(META_PATH)) {
    try { meta = JSON.parse(readFileSync(META_PATH, 'utf8')); } catch { /* ignore */ }
  }

  return {
    halten,
    straalM,
    bron: 'OVapi GTFS (OpenOV)',
    bronUrl: 'https://gtfs.ovapi.nl/',
    bijgewerkt: meta?.updatedAt || null,
  };
}

/** Warm cache at server start (non-blocking). */
export function warmOvCache() {
  ensureStopsLoaded().catch(e => console.warn('OV warm-up:', e.message));
}
