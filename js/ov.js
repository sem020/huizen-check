import { $, apiUrl } from './config.js';
import { dossierState, isActieveGeneratie } from './state.js';
import { toonOvOpKaart } from './map.js';

function fmtM(m) {
  if (m == null) return '—';
  if (m < 1000) return `${m} m`;
  return (m / 1000).toLocaleString('nl-NL', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' km';
}

const SOORT_LABEL = {
  bus: 'Bus',
  tram: 'Tram',
  metro: 'Metro',
  trein: 'Trein',
  ov: 'OV',
};

const COLD_MSG =
  'OV-halten ophalen… De eerste keer kan dit tot een minuut duren (haltebestand wordt geladen).';

function bindRetry(status, lat, lon, gen) {
  const btn = status?.querySelector('[data-ov-retry]');
  if (!btn) return;
  btn.addEventListener('click', () => {
    if (!isActieveGeneratie(gen)) return;
    laadOv(lat, lon, gen);
  });
}

export async function laadOv(lat, lon, gen) {
  const status = $('ov-status');
  const box = $('ov-inhoud');
  if (status) {
    status.textContent = COLD_MSG;
    status.className = 'status';
  }
  if (box) box.style.display = 'none';
  if (isActieveGeneratie(gen)) {
    dossierState.ov = null;
    toonOvOpKaart([]);
  }

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    if (isActieveGeneratie(gen) && status) status.textContent = 'Geen coördinaten voor OV-zoektocht.';
    return;
  }

  try {
    const r = await fetch(apiUrl(`/api/ov-dichtbij?lat=${lat}&lon=${lon}&limiet=5&straal=1500`));
    const j = await r.json();
    if (!isActieveGeneratie(gen)) return;
    if (!r.ok) throw new Error(j.error || 'Fout ' + r.status);

    dossierState.ov = j;
    if (!box || !status) return;

    const halten = j.halten || [];
    if (!halten.length) {
      status.textContent = 'Geen OV-halte binnen 1,5 km gevonden.';
      toonOvOpKaart([]);
      return;
    }

    status.textContent = '';
    box.style.display = 'block';
    $('ov-lijst').innerHTML = halten.map(h => {
      const soort = SOORT_LABEL[h.soort] || 'OV';
      return `<div class="ov-item">
        <span class="ov-soort">${soort}</span>
        <span class="ov-naam">${h.naam}</span>
        <span class="ov-afst">${fmtM(h.afstandM)}</span>
      </div>`;
    }).join('');
    toonOvOpKaart(halten);
  } catch (e) {
    if (!isActieveGeneratie(gen)) return;
    if (status) {
      status.innerHTML =
        `Kon OV-halten niet ophalen. Probeer het opnieuw als de server even bezig is met laden. ` +
        `<button type="button" class="status-retry" data-ov-retry>Opnieuw proberen</button>`;
      status.className = 'status f';
      bindRetry(status, lat, lon, gen);
    }
    console.warn('OV:', e.message);
  }
}
