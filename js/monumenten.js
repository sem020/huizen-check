import { $, apiUrl } from './config.js';
import { dossierState } from './state.js';

function fmtAfstand(m) {
  if (m == null) return '';
  if (m < 1) return 'op dit adres';
  return `± ${m} m`;
}

export async function laadMonumenten(lat, lon) {
  const status = $('mon-status');
  const box = $('mon-inhoud');
  if (status) {
    status.textContent = 'Monumentenstatus ophalen…';
    status.className = 'status';
  }
  if (box) box.style.display = 'none';
  dossierState.monumenten = null;

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    if (status) status.textContent = 'Geen coördinaten voor monumentencheck.';
    return;
  }

  try {
    const r = await fetch(apiUrl(`/api/monumenten?lat=${lat}&lon=${lon}&straal=60`));
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'Fout ' + r.status);

    dossierState.monumenten = j;
    if (!box || !status) return;

    if (!j.inBuurt?.length && !j.stadsgezicht) {
      status.textContent = 'Geen rijksmonument in de directe omgeving.';
      status.className = 'status';
      box.style.display = 'none';
      return;
    }

    status.textContent = '';
    box.style.display = 'block';

    const badge = $('mon-badge');
    const titel = $('mon-titel');
    const meta = $('mon-meta');
    const lijst = $('mon-lijst');

    if (j.isMonument && j.dichtstbij) {
      badge.textContent = 'Ja';
      badge.className = 'mon-badge mon-ja';
      titel.textContent = j.dichtstbij.naam || `Rijksmonument ${j.dichtstbij.id || ''}`.trim();
      meta.textContent = [
        fmtAfstand(j.dichtstbij.afstandM),
        j.dichtstbij.aangewezen ? `aangewezen ${String(j.dichtstbij.aangewezen).slice(0, 4)}` : '',
      ].filter(Boolean).join(' · ');
    } else if (j.inBuurt?.length) {
      badge.textContent = j.inBuurt.length;
      badge.className = 'mon-badge mon-buurt';
      titel.textContent = 'Rijksmonument(en) in de buurt';
      meta.textContent = `Binnen ± 60 m van dit adres`;
    } else {
      badge.textContent = '—';
      badge.className = 'mon-badge mon-nee';
      titel.textContent = 'Geen rijksmonument';
      meta.textContent = '';
    }

    const links = [];
    (j.inBuurt || []).slice(0, 3).forEach(m => {
      if (!m.url) return;
      links.push(`<a href="${m.url}" target="_blank" rel="noopener">${m.naam || 'Rijksmonument ' + (m.id || '')}${m.afstandM != null ? ` <small>(${m.afstandM} m)</small>` : ''}</a>`);
    });
    if (j.stadsgezicht?.url) {
      links.push(`<a href="${j.stadsgezicht.url}" target="_blank" rel="noopener">${j.stadsgezicht.naam || 'Beschermd stads-/dorpsgezicht'}</a>`);
    }
    lijst.innerHTML = links.length ? links.join('') : '';
  } catch (e) {
    if (status) {
      status.innerHTML = `Kon monumenten niet ophalen. <a href="https://monumentenregister.cultureelerfgoed.nl/" target="_blank" rel="noopener">Open register</a>`;
      status.className = 'status f';
    }
    console.warn('Monumenten:', e.message);
  }
}
