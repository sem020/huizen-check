import { $, apiUrl } from './config.js';
import { dossierState } from './state.js';
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

export async function laadOv(lat, lon) {
  const status = $('ov-status');
  const box = $('ov-inhoud');
  if (status) {
    status.textContent = 'OV-halten ophalen…';
    status.className = 'status';
  }
  if (box) box.style.display = 'none';
  dossierState.ov = null;
  toonOvOpKaart([]);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    if (status) status.textContent = 'Geen coördinaten voor OV-zoektocht.';
    return;
  }

  try {
    const r = await fetch(apiUrl(`/api/ov-dichtbij?lat=${lat}&lon=${lon}&limiet=5&straal=1500`));
    const j = await r.json();
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
    if (status) {
      status.textContent = 'Kon OV-halten niet ophalen.';
      status.className = 'status f';
    }
    console.warn('OV:', e.message);
  }
}
