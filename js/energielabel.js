import { $, apiUrl } from './config.js';
import { dossierState } from './state.js';

function formatDatum(iso) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return null;
  }
}

function klasseKleur(k) {
  const x = String(k || '').toUpperCase();
  if (x.startsWith('A')) return 'el-a';
  if (x === 'B') return 'el-b';
  if (x === 'C') return 'el-c';
  if (x === 'D') return 'el-d';
  if (x === 'E') return 'el-e';
  if (x === 'F' || x === 'G') return 'el-fg';
  return 'el-onbekend';
}

function toonLabel(label) {
  const box = $('el-inhoud');
  const status = $('el-status');
  if (!box || !status) return;

  if (!label?.klasse) {
    status.textContent = 'Geen geregistreerd energielabel gevonden voor dit adres.';
    status.className = 'status';
    box.style.display = 'none';
    dossierState.energielabel = null;
    return;
  }

  dossierState.energielabel = label;
  status.textContent = '';
  box.style.display = 'flex';

  const badge = $('el-badge');
  badge.textContent = label.klasse;
  badge.className = 'el-badge ' + klasseKleur(label.klasse);

  const meta = [];
  if (label.gebouwtype) meta.push(label.gebouwtype);
  if (label.geldigTot) {
    const d = formatDatum(label.geldigTot);
    if (d) meta.push('geldig tot ' + d);
  } else if (label.opnamedatum) {
    const d = formatDatum(label.opnamedatum);
    if (d) meta.push('opname ' + d);
  }
  $('el-meta').textContent = meta.join(' · ') || 'Geregistreerd in EP-Online';
}

export async function laadEnergielabel(doc) {
  const status = $('el-status');
  const box = $('el-inhoud');
  if (status) {
    status.textContent = 'Energielabel ophalen…';
    status.className = 'status';
  }
  if (box) box.style.display = 'none';
  dossierState.energielabel = null;

  const vbo = doc.adresseerbaarobject_id;
  const params = new URLSearchParams();
  if (vbo) params.set('vbo', vbo);
  else {
    if (!doc.postcode || !doc.huis_nlt && !doc.huisnummer) {
      if (status) status.textContent = 'Onvoldoende adresgegevens voor energielabel.';
      return;
    }
    params.set('postcode', doc.postcode);
    const nr = String(doc.huis_nlt || doc.huisnummer || '').match(/\d+/);
    if (nr) params.set('huisnummer', nr[0]);
    if (doc.huisletter) params.set('huisletter', doc.huisletter);
  }

  try {
    const r = await fetch(apiUrl('/api/energielabel?' + params));
    const j = await r.json();
    if (r.status === 404) {
      toonLabel(null);
      return;
    }
    if (!r.ok) throw new Error(j.error || 'Fout ' + r.status);
    toonLabel(j.label);
  } catch (e) {
    if (status) {
      status.innerHTML = `Kon energielabel niet ophalen. <a href="https://www.ep-online.nl/" target="_blank" rel="noopener">Open EP-Online</a>`;
      status.className = 'status f';
    }
    console.warn('Energielabel:', e.message);
  }
}
