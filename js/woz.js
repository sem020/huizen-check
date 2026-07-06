import { WOZ, $ } from './config.js';
import { fmtEur, padNa } from './utils.js';
import { dossierState } from './state.js';
import { updatePremiumUi } from './premium.js';

function tekenSpark(w) {
  const svg = $('spark'), W = 380, H = 64, pad = 6;
  const min = Math.min(...w.map(x => x.waarde)), max = Math.max(...w.map(x => x.waarde));
  const X = i => pad + i * (W - 2 * pad) / Math.max(1, w.length - 1);
  const Y = v => max === min ? H / 2 : (H - 14) - (v - min) / (max - min) * (H - 26);
  const pts = w.map((x, i) => `${X(i).toFixed(1)},${Y(x.waarde).toFixed(1)}`);
  const lijn = 'M' + pts.join(' L');
  const vlak = lijn + ` L${X(w.length - 1).toFixed(1)},${H - 12} L${X(0).toFixed(1)},${H - 12} Z`;
  const laatste = w[w.length - 1];
  svg.innerHTML = svg.querySelector('defs').outerHTML +
    `<path class="vlak" d="${vlak}"/><path class="lijn" d="${lijn}"/>
     <circle cx="${X(w.length - 1).toFixed(1)}" cy="${Y(laatste.waarde).toFixed(1)}" r="3.5"/>
     <text x="${pad}" y="${H - 1}">${w[0].jaar}</text>
     <text x="${W - pad}" y="${H - 1}" text-anchor="end">${laatste.jaar}</text>`;
}

export async function laadWoz(doc) {
  const naId = padNa(doc.nummeraanduiding_id);
  const klaarStat = t => { const el = $('s-woz'); el.classList.remove('skelet'); el.textContent = t; };
  const fallback = (msg, isError = true) => {
    klaarStat('—');
    dossierState.wozKort = '—';
    dossierState.wozBedrag = '—';
    dossierState.wozDelta = '';
    dossierState.wozRijen = [];
    $('woz-status').innerHTML = msg;
    $('woz-status').className = isError ? 'status f' : 'status';
    $('woz-inhoud').style.display = 'none';
    dossierState.klaar.woz = true;
    updatePremiumUi();
  };
  const loketLink = `<a href="https://www.wozwaardeloket.nl/" target="_blank" rel="noopener">WOZ-waardeloket</a>`;
  if (!naId) {
    return fallback(`Geen nummeraanduiding bekend voor dit adres. Controleer het in het ${loketLink}.`);
  }
  try {
    const r = await fetch(`${WOZ}/wozwaarde/nummeraanduiding/${naId}`, { headers: { Accept: 'application/json' } });
    if (r.status === 404) {
      return fallback(`Geen WOZ-waarde gevonden — het WOZ-loket toont alleen woningen. Dit adres is waarschijnlijk geen woonfunctie (museum, kantoor, etc.). Bekijk het ${loketLink}.`, false);
    }
    if (!r.ok) throw new Error(r.status);
    const j = await r.json();
    const w = (j.wozWaarden || [])
      .map(x => ({ jaar: +String(x.peildatum || '').slice(0, 4), waarde: x.vastgesteldeWaarde }))
      .filter(x => x.jaar && x.waarde)
      .sort((a, b) => a.jaar - b.jaar);
    if (!w.length) {
      return fallback(`Geen WOZ-waarden beschikbaar voor dit adres. Bekijk het ${loketLink}.`, false);
    }

    const laatste = w[w.length - 1];
    const kort = '€ ' + Math.round(laatste.waarde / 1000) + 'k';
    klaarStat(kort);
    dossierState.wozKort = kort;
    dossierState.wozBedrag = fmtEur(laatste.waarde);
    dossierState.wozRijen = w.map(x => ({ jaar: x.jaar, waarde: x.waarde }));

    $('woz-bedrag').innerHTML = fmtEur(laatste.waarde) + `<small>peildatum 1-1-${laatste.jaar}</small>`;
    if (w.length > 1) {
      const vorig = w[w.length - 2].waarde;
      const d = ((laatste.waarde - vorig) / vorig * 100);
      const delta = (d >= 0 ? '▲ +' : '▼ ') + d.toFixed(1) + '% j/j';
      $('woz-delta').textContent = delta;
      $('woz-delta').style.color = d >= 0 ? 'var(--ok)' : 'var(--warn)';
      dossierState.wozDelta = delta;
    } else {
      $('woz-delta').textContent = '';
      dossierState.wozDelta = '';
    }
    tekenSpark(w.slice(-10));
    $('woz-status').textContent = '';
    $('woz-inhoud').style.display = 'block';
    dossierState.klaar.woz = true;
    updatePremiumUi();
  } catch {
    fallback(`Kon de WOZ-koppeling niet bereiken. Zoek dit adres direct op in het ${loketLink}.`);
  }
}
