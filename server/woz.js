/** Kadaster WOZ-waardeloket API (server-side, vermijdt browser-CORS). */
const WOZ_BASE = 'https://api.kadaster.nl/lvwoz/wozwaardeloket-api/v1';
const UA = 'Pandloket/1.0 (https://github.com/sem020/huizen-check)';

function padNa(id) {
  const s = String(id || '').replace(/\D/g, '');
  return s ? s.padStart(16, '0') : '';
}

/**
 * @param {string} nummeraanduidingId BAG-nummeraanduiding (16 cijfers)
 * @returns {Promise<{ wozWaarden: { jaar: number, waarde: number }[], object?: object } | null>}
 */
export async function wozOpNummeraanduiding(nummeraanduidingId) {
  const na = padNa(nummeraanduidingId);
  if (!na) {
    const err = new Error('nummeraanduiding verplicht');
    err.status = 400;
    throw err;
  }

  const url = `${WOZ_BASE}/wozwaarde/nummeraanduiding/${na}`;
  const r = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': UA,
    },
  });

  if (r.status === 404) return null;

  if (r.status === 429) {
    const err = new Error('WOZ-limiet bereikt — probeer over een minuut opnieuw');
    err.status = 429;
    throw err;
  }

  if (!r.ok) {
    const err = new Error(`WOZ API ${r.status}`);
    err.status = r.status;
    throw err;
  }

  const j = await r.json();
  const wozWaarden = (j.wozWaarden || [])
    .map(x => ({
      jaar: +String(x.peildatum || '').slice(0, 4),
      waarde: Number(x.vastgesteldeWaarde),
    }))
    .filter(x => x.jaar && Number.isFinite(x.waarde) && x.waarde > 0)
    .sort((a, b) => a.jaar - b.jaar);

  if (!wozWaarden.length) return null;

  return {
    wozWaarden,
    object: j.wozObject || null,
    bron: 'Kadaster WOZ-waardeloket',
  };
}
