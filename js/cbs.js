import { $, apiUrl } from './config.js';
import { dossierState, isActieveGeneratie } from './state.js';

function fmtN(n) {
  if (n == null) return '—';
  return Number(n).toLocaleString('nl-NL');
}

function fmtEurK(n) {
  if (n == null) return '—';
  if (n >= 1_000_000) return '€ ' + (n / 1_000_000).toFixed(1).replace('.', ',') + ' mln';
  return '€ ' + Math.round(n / 1000) + 'k';
}

export async function laadCbs(doc, gen) {
  const status = $('cbs-status');
  const box = $('cbs-inhoud');
  if (status) {
    status.textContent = 'Buurtcijfers ophalen…';
    status.className = 'status';
  }
  if (box) box.style.display = 'none';
  if (isActieveGeneratie(gen)) dossierState.cbs = null;

  const buurt = doc.buurtnaam;
  if (!buurt) {
    if (isActieveGeneratie(gen) && status) status.textContent = 'Geen buurt bekend voor dit adres.';
    return;
  }

  const params = new URLSearchParams({ buurt });
  if (doc.gemeentecode) params.set('gemeentecode', doc.gemeentecode);
  if (doc.gemeentenaam) params.set('gemeente', doc.gemeentenaam);

  try {
    const r = await fetch(apiUrl('/api/cbs-buurt?' + params));
    const j = await r.json();
    if (!isActieveGeneratie(gen)) return;
    if (r.status === 404) {
      if (status) status.textContent = 'Geen CBS-cijfers gevonden voor deze buurt.';
      return;
    }
    if (!r.ok) throw new Error(j.error || 'Fout ' + r.status);

    const b = j.buurt;
    dossierState.cbs = b;
    if (!box || !status) return;

    status.textContent = '';
    box.style.display = 'block';
    const jaar = b.jaar ? ` · CBS ${b.jaar}` : '';
    $('cbs-naam').textContent = b.buurt + (b.gemeente ? `, ${b.gemeente}` : '') + jaar;

    const cells = [
      ['Inwoners', fmtN(b.inwoners)],
      ['Huishoudens', fmtN(b.huishoudens)],
      ['Woningen', fmtN(b.woningen)],
      ['Dichtheid', b.dichtheid != null ? fmtN(b.dichtheid) + '/km²' : '—'],
      [b.jaar ? `Gem. WOZ (${b.jaar})` : 'Gem. WOZ', fmtEurK(b.gemWoz)],
      ['Koop / huur', (b.pctKoop != null || b.pctHuur != null)
        ? `${b.pctKoop ?? '—'}% / ${b.pctHuur ?? '—'}%`
        : '—'],
    ];

    $('cbs-grid').innerHTML = cells.map(([l, v]) =>
      `<div class="cbs-cel"><div class="cbs-v">${v}</div><div class="cbs-l">${l}</div></div>`
    ).join('');
  } catch (e) {
    if (!isActieveGeneratie(gen)) return;
    if (status) {
      status.innerHTML = `Kon CBS-cijfers niet ophalen. <a href="https://www.cbsinuwbuurt.nl/" target="_blank" rel="noopener">CBS in uw buurt</a>`;
      status.className = 'status f';
    }
    console.warn('CBS:', e.message);
  }
}
