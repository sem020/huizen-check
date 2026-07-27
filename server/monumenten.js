/** Rijksmonumenten via PDOK OGC API Features (RCE). */
const MON_BASE = 'https://api.pdok.nl/rce/beschermde-gebieden-cultuurhistorie/ogc/v1';

function haversineM(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function monumentIdFromUrl(url) {
  const m = String(url || '').match(/monumenten\/(\d+)/i);
  return m ? m[1] : null;
}

async function haalTitel(url) {
  try {
    const r = await fetch(url, {
      headers: { Accept: 'text/html' },
      signal: AbortSignal.timeout(2500),
    });
    if (!r.ok) return null;
    const html = await r.text();
    const og = html.match(/property="og:title"\s+content="([^"]+)"/i)
      || html.match(/content="([^"]+)"\s+property="og:title"/i);
    if (og) return cleanTitel(og[1]);
    const t = html.match(/<title>([^<]+)<\/title>/i);
    if (t) return cleanTitel(t[1]);
  } catch { /* ignore */ }
  return null;
}

function cleanTitel(s) {
  return String(s)
    .replace(/\s*[|–|-]\s*Rijksdienst.*$/i, '')
    .replace(/\s*[|–|-]\s*Monumentenregister.*$/i, '')
    .trim();
}

/**
 * Zoek rijksmonumenten rondom een punt.
 * @param {number} lat
 * @param {number} lon
 * @param {number} [straalM=60]
 */
async function zoekMonumenten(lat, lon, straalM = 60) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    const err = new Error('lat/lon verplicht');
    err.status = 400;
    throw err;
  }

  // ~1° lat ≈ 111km; lon schaalt met cos(lat)
  const dLat = straalM / 111320;
  const dLon = straalM / (111320 * Math.cos(lat * Math.PI / 180));
  const bbox = [
    lon - dLon, lat - dLat,
    lon + dLon, lat + dLat,
  ].join(',');

  const url = `${MON_BASE}/collections/rce_inspire_points/items?bbox=${bbox}&limit=20&f=json`;
  const r = await fetch(url, { headers: { Accept: 'application/geo+json, application/json' } });
  if (!r.ok) {
    const err = new Error(`PDOK monumenten ${r.status}`);
    err.status = r.status;
    throw err;
  }
  const data = await r.json();
  const features = data.features || [];

  const items = features.map(f => {
    const coords = f.geometry?.coordinates || [];
    const [mlon, mlat] = coords;
    const props = f.properties || {};
    const registerUrl = props.ci_citation || null;
    const id = monumentIdFromUrl(registerUrl);
    const afstand = (Number.isFinite(mlat) && Number.isFinite(mlon))
      ? Math.round(haversineM(lat, lon, mlat, mlon))
      : null;
    return {
      id,
      url: registerUrl,
      afstandM: afstand,
      aangewezen: props.legalfoundationdate || null,
      namespace: props.namespace || null,
    };
  })
    .filter(m => m.afstandM == null || m.afstandM <= straalM)
    .sort((a, b) => (a.afstandM ?? 9999) - (b.afstandM ?? 9999));

  // Verrijk dichtstbijzijnde met titel (max 3)
  const top = items.slice(0, 3);
  await Promise.all(top.map(async m => {
    if (m.url) m.naam = await haalTitel(m.url);
    if (!m.naam && m.id) m.naam = `Rijksmonument ${m.id}`;
  }));

  // Beschermd stads-/dorpsgezicht?
  let stadsgezicht = null;
  try {
    const polyUrl = `${MON_BASE}/collections/rce_inspire_polygons/items?bbox=${bbox}&limit=5&f=json`;
    const pr = await fetch(polyUrl, { headers: { Accept: 'application/geo+json, application/json' } });
    if (pr.ok) {
      const pd = await pr.json();
      const poly = (pd.features || []).find(f =>
        String(f.properties?.namespace || '').includes('gezicht')
        || String(f.properties?.ci_citation || '').includes('gezicht')
        || String(f.properties?.namespace || '').includes('stads')
      ) || (pd.features || [])[0];
      if (poly) {
        const u = poly.properties?.ci_citation;
        stadsgezicht = {
          url: u || null,
          naam: u ? await haalTitel(u) : null,
          namespace: poly.properties?.namespace || null,
        };
      }
    }
  } catch { /* optional */ }

  return {
    isMonument: items.length > 0 && (items[0].afstandM ?? 999) <= 40,
    dichtstbij: top[0] || null,
    inBuurt: top,
    aantalInBuurt: items.length,
    stadsgezicht,
  };
}

exports.zoekMonumenten = zoekMonumenten;
