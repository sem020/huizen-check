const { config } = require('./config.js');
const EP_BASE = 'https://public.ep-online.nl/api/v5';

function authHeaders() {
  if (!config.epOnlineApiKey) {
    const err = new Error('EP_ONLINE_API_KEY ontbreekt in .env');
    err.status = 503;
    throw err;
  }
  return {
    Accept: 'application/json',
    Authorization: config.epOnlineApiKey,
  };
}

function normaliseer(item) {
  if (!item) return null;
  return {
    klasse: item.Energieklasse || item.energieklasse || null,
    energieIndex: item.EnergieIndex ?? item.energieIndex ?? null,
    gebouwtype: item.Gebouwtype || item.gebouwtype || null,
    gebouwsubtype: item.Gebouwsubtype || null,
    gebouwklasse: item.Gebouwklasse || null,
    bouwjaar: item.Bouwjaar ?? null,
    opnamedatum: item.Opnamedatum || null,
    geldigTot: item.Geldig_tot || item.GeldigTot || null,
    registratiedatum: item.Registratiedatum || null,
    postcode: item.Postcode || null,
    huisnummer: item.Huisnummer ?? null,
    huisletter: item.Huisletter || null,
    vboId: item.BAGVerblijfsobjectID || null,
    berekendVerbruik: item.BerekendeEnergieverbruik ?? null,
    berekendeCo2: item.BerekendeCO2Emissie ?? null,
  };
}

async function epFetch(path) {
  const headers = authHeaders();
  const r = await fetch(`${EP_BASE}${path}`, { headers });
  if (r.status === 404) return null;
  if (r.status === 401) {
    // Soms faalt de eerste call; één retry
    await new Promise(r => setTimeout(r, 200));
    const r2 = await fetch(`${EP_BASE}${path}`, { headers });
    if (r2.status === 404) return null;
    if (!r2.ok) {
      const body = await r2.text();
      const err = new Error(`EP-Online ${r2.status}: ${body.slice(0, 200)}`);
      err.status = r2.status;
      throw err;
    }
    const data2 = await r2.json();
    const list2 = Array.isArray(data2) ? data2 : (data2 ? [data2] : []);
    if (!list2.length) return null;
    list2.sort((a, b) => String(b.Registratiedatum || '').localeCompare(String(a.Registratiedatum || '')));
    return normaliseer(list2[0]);
  }
  if (!r.ok) {
    const body = await r.text();
    const err = new Error(`EP-Online ${r.status}: ${body.slice(0, 200)}`);
    err.status = r.status;
    throw err;
  }
  const data = await r.json();
  const list = Array.isArray(data) ? data : (data ? [data] : []);
  if (!list.length) return null;
  // Nieuwste registratie eerst
  list.sort((a, b) => String(b.Registratiedatum || '').localeCompare(String(a.Registratiedatum || '')));
  return normaliseer(list[0]);
}

/** Op BAG verblijfsobject-id (16 cijfers). */
async function labelOpVbo(vboId) {
  const id = String(vboId || '').replace(/\D/g, '').padStart(16, '0');
  if (!id || id === '0000000000000000') {
    const err = new Error('Ongeldig verblijfsobject-id');
    err.status = 400;
    throw err;
  }
  return epFetch(`/PandEnergielabel/AdresseerbaarObject/${id}`);
}

/** Op postcode + huisnummer (+ optioneel letter/toevoeging). */
async function labelOpAdres({ postcode, huisnummer, huisletter, toevoeging }) {
  const pc = String(postcode || '').replace(/\s+/g, '').toUpperCase();
  const nr = String(huisnummer || '').replace(/\D/g, '');
  if (!pc || !nr) {
    const err = new Error('postcode en huisnummer verplicht');
    err.status = 400;
    throw err;
  }
  const q = new URLSearchParams({ postcode: pc, huisnummer: nr });
  if (huisletter) q.set('huisletter', String(huisletter).slice(0, 1).toUpperCase());
  if (toevoeging) q.set('huisnummertoevoeging', String(toevoeging));
  return epFetch(`/PandEnergielabel/Adres?${q}`);
}

async function pingEpOnline() {
  if (!config.epOnlineApiKey) return { ok: false, reason: 'no-key' };
  const r = await fetch(`${EP_BASE}/Ping`, { headers: authHeaders() });
  return { ok: r.ok, status: r.status };
}

exports.labelOpVbo = labelOpVbo;
exports.labelOpAdres = labelOpAdres;
exports.pingEpOnline = pingEpOnline;
