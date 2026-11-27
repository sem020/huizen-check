import { $, apiUrl } from './config.js';
import { dossierState, isActieveGeneratie } from './state.js';
import { toonSupermarktenOpKaart } from './map.js';

function fmtKm(km) {
  if (km == null) return '—';
  if (km < 1) return Math.round(km * 1000) + ' m';
  return km.toLocaleString('nl-NL', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' km';
}

function fmtM(m) {
  if (m == null) return '—';
  if (m < 1000) return `${m} m`;
  return (m / 1000).toLocaleString('nl-NL', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' km';
}

/** CBS-buurtgemiddelden (zonder supermarkt — die is adres-specifiek). */
const CBS_LABELS = [
  ['huisarts', 'Huisarts'],
  ['basisschool', 'Basisschool'],
  ['kinderopvang', 'Kinderopvang'],
  ['apotheek', 'Apotheek'],
  ['bibliotheek', 'Bibliotheek'],
  ['treinstation', 'Treinstation'],
  ['park', 'Park'],
];

async function haalCbsNabijheid(doc) {
  const buurt = doc.buurtnaam;
  if (!buurt) return null;
  const params = new URLSearchParams({ buurt });
  if (doc.gemeentecode) params.set('gemeentecode', doc.gemeentecode);
  if (doc.gemeentenaam) params.set('gemeente', doc.gemeentenaam);
  const r = await fetch(apiUrl('/api/cbs-nabijheid?' + params));
  const j = await r.json();
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(j.error || 'Fout ' + r.status);
  return j.nabijheid;
}

/** @returns {Promise<{ supermarket: object|null, supermarkets: object[], beschikbaar: boolean }>} */
async function haalSupermarkten(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return { supermarket: null, supermarkets: [], beschikbaar: false };
  }
  try {
    const r = await fetch(apiUrl(`/api/supermarkt-dichtbij?lat=${lat}&lon=${lon}&straal=1500&limiet=8`));
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.beschikbaar === false) {
      return { supermarket: null, supermarkets: [], beschikbaar: false };
    }
    const lijst = Array.isArray(j.supermarkets) ? j.supermarkets : (j.supermarket ? [j.supermarket] : []);
    return {
      supermarket: j.supermarket || lijst[0] || null,
      supermarkets: lijst,
      beschikbaar: true,
    };
  } catch {
    return { supermarket: null, supermarkets: [], beschikbaar: false };
  }
}

function tekenGrid(n, supermarket, beschikbaar) {
  const a = n?.afstanden || {};
  const cells = [];

  if (supermarket) {
    cells.push(`<div class="cbs-cel cbs-cel-adres">
      <div class="cbs-v">${fmtM(supermarket.afstandM)}</div>
      <div class="cbs-l">Supermarkt</div>
      <div class="cbs-sub">${supermarket.naam}</div>
    </div>`);
  } else if (beschikbaar === false) {
    cells.push(`<div class="cbs-cel cbs-cel-adres">
      <div class="cbs-v">—</div>
      <div class="cbs-l">Supermarkt</div>
      <div class="cbs-sub">tijdelijk niet beschikbaar</div>
    </div>`);
  } else {
    cells.push(`<div class="cbs-cel cbs-cel-adres">
      <div class="cbs-v">—</div>
      <div class="cbs-l">Supermarkt</div>
      <div class="cbs-sub">niet gevonden</div>
    </div>`);
  }

  for (const [key, label] of CBS_LABELS) {
    cells.push(`<div class="cbs-cel"><div class="cbs-v">${fmtKm(a[key])}</div><div class="cbs-l">${label}</div></div>`);
  }

  $('nabij-grid').innerHTML = cells.join('');
}

function bindRetry(status, doc, lat, lon, gen) {
  const btn = status?.querySelector('[data-nabij-retry]');
  if (!btn) return;
  btn.addEventListener('click', () => {
    if (!isActieveGeneratie(gen)) return;
    laadNabijheid(doc, lat, lon, gen);
  });
}

export async function laadNabijheid(doc, lat, lon, gen) {
  const status = $('nabij-status');
  const box = $('nabij-inhoud');
  if (status) {
    status.textContent = 'Nabijheid ophalen…';
    status.className = 'status';
  }
  if (box) box.style.display = 'none';
  if (isActieveGeneratie(gen)) {
    dossierState.nabijheid = null;
    toonSupermarktenOpKaart([]);
  }

  const buurt = doc.buurtnaam;
  if (!buurt && !(Number.isFinite(lat) && Number.isFinite(lon))) {
    if (isActieveGeneratie(gen) && status) status.textContent = 'Geen buurt of coördinaten voor nabijheid.';
    return;
  }

  try {
    const [cbsResult, smResult] = await Promise.allSettled([
      buurt ? haalCbsNabijheid(doc) : Promise.resolve(null),
      haalSupermarkten(lat, lon),
    ]);
    if (!isActieveGeneratie(gen)) return;

    const n = cbsResult.status === 'fulfilled' ? cbsResult.value : null;
    const smData = smResult.status === 'fulfilled'
      ? smResult.value
      : { supermarket: null, supermarkets: [], beschikbaar: false };
    const supermarket = smData.supermarket;
    const supermarkets = smData.supermarkets || [];
    const smBeschikbaar = smData.beschikbaar !== false;

    if (cbsResult.status === 'rejected' && smResult.status === 'rejected') {
      throw cbsResult.reason || smResult.reason;
    }

    if (!n && !supermarket) {
      if (status && smData.beschikbaar === false) {
        status.innerHTML =
          `Supermarkten zijn tijdelijk niet beschikbaar. ` +
          `<button type="button" class="status-retry" data-nabij-retry>Opnieuw proberen</button>`;
        status.className = 'status f';
        bindRetry(status, doc, lat, lon, gen);
        return;
      }
      if (status) status.textContent = 'Geen nabijheidsgegevens gevonden.';
      return;
    }

    const merged = n
      ? {
          ...n,
          afstanden: {
            ...(n.afstanden || {}),
            supermarkt: supermarket ? supermarket.afstandM / 1000 : null,
          },
          supermarket,
          supermarkets,
        }
      : {
          buurt: doc.buurtnaam || '',
          gemeente: doc.gemeentenaam || '',
          afstanden: { supermarkt: supermarket ? supermarket.afstandM / 1000 : null },
          supermarket,
          supermarkets,
        };

    dossierState.nabijheid = merged;
    if (!box || !status) return;

    status.textContent = '';
    box.style.display = 'block';

    const delen = [];
    if (merged.buurt) {
      delen.push(
        `Buurtgemiddelde ${merged.buurt}` +
          (merged.gemeente ? `, ${merged.gemeente}` : '') +
          (merged.jaar ? ` (${merged.jaar})` : ''),
      );
    }
    if (supermarket) {
      delen.push(
        supermarkets.length > 1
          ? `${supermarkets.length} supermarkten op de kaart`
          : 'supermarkt vanaf dit adres',
      );
    }
    $('nabij-naam').textContent = delen.join(' · ') || 'Nabijheid';

    tekenGrid(n, supermarket, smBeschikbaar);
    toonSupermarktenOpKaart(supermarkets);

    if (cbsResult.status === 'rejected') {
      console.warn('CBS nabijheid:', cbsResult.reason?.message);
    }
    if (smResult.status === 'rejected') {
      console.warn('Supermarkt:', smResult.reason?.message);
    }
  } catch (e) {
    if (!isActieveGeneratie(gen)) return;
    if (status) {
      status.innerHTML = `Kon nabijheid niet ophalen. <a href="https://www.cbs.nl/nl-nl/cijfers/detail/86270NED" target="_blank" rel="noopener">CBS Nabijheid</a>`;
      status.className = 'status f';
    }
    console.warn('Nabijheid:', e.message);
  }
}
