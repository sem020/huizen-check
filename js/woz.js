import { $, apiUrl } from './config.js';
import { fmtEur, padNa } from './utils.js';
import { dossierState } from './state.js';

const SPARK_DEFS = `<defs><linearGradient id="gg" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="rgba(13,148,136,.22)"/><stop offset="1" stop-color="rgba(13,148,136,0)"/>
</linearGradient></defs>`;

const VIEW_W = 380;
const VIEW_H = 72;
const PAD_X = 10;
const PAD_TOP = 8;
const PAD_BOT = 18;

/** @type {{ jaar: number, waarde: number }[]} */
let scrubData = [];
let scrubIdx = 0;
let scrubBound = false;

function xAt(i, n) {
  if (n <= 1) return VIEW_W / 2;
  return PAD_X + i * (VIEW_W - 2 * PAD_X) / (n - 1);
}

function yAt(waarde, min, max) {
  const chartH = VIEW_H - PAD_TOP - PAD_BOT;
  if (max === min) return PAD_TOP + chartH / 2;
  return PAD_TOP + chartH - ((waarde - min) / (max - min)) * chartH;
}

function toonPeiljaar(i) {
  if (!scrubData.length) return;
  scrubIdx = Math.max(0, Math.min(scrubData.length - 1, i));
  const punt = scrubData[scrubIdx];
  const bedrag = $('woz-bedrag');
  const peil = $('woz-peil');
  const deltaEl = $('woz-delta');
  const spark = $('spark');
  const wrap = $('woz-spark');

  if (bedrag) bedrag.textContent = fmtEur(punt.waarde);
  if (peil) peil.textContent = `peildatum 1-1-${punt.jaar}`;

  if (deltaEl) {
    if (scrubIdx > 0) {
      const vorig = scrubData[scrubIdx - 1].waarde;
      const d = ((punt.waarde - vorig) / vorig) * 100;
      deltaEl.textContent = (d >= 0 ? '▲ +' : '▼ ') + d.toFixed(1) + '% j/j';
      deltaEl.style.color = d >= 0 ? 'var(--ok)' : 'var(--warn)';
    } else {
      deltaEl.textContent = '';
    }
  }

  const knop = spark?.querySelector('.woz-knop');
  const lijn = spark?.querySelector('.woz-gids');
  if (knop && lijn) {
    const min = Math.min(...scrubData.map(x => x.waarde));
    const max = Math.max(...scrubData.map(x => x.waarde));
    const cx = xAt(scrubIdx, scrubData.length);
    const cy = yAt(punt.waarde, min, max);
    knop.setAttribute('cx', cx.toFixed(1));
    knop.setAttribute('cy', cy.toFixed(1));
    lijn.setAttribute('x1', cx.toFixed(1));
    lijn.setAttribute('x2', cx.toFixed(1));
  }

  if (wrap) {
    wrap.setAttribute('aria-valuenow', String(punt.jaar));
    wrap.setAttribute('aria-valuetext', `${punt.jaar}: ${fmtEur(punt.waarde)}`);
  }
}

function indexVanPointer(clientX) {
  const svg = $('spark');
  if (!svg || scrubData.length <= 1) return scrubData.length - 1;
  const rect = svg.getBoundingClientRect();
  const t = (clientX - rect.left) / Math.max(1, rect.width);
  const x = PAD_X + t * (VIEW_W - 2 * PAD_X);
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < scrubData.length; i++) {
    const d = Math.abs(xAt(i, scrubData.length) - x);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

function bindScrub() {
  const wrap = $('woz-spark');
  if (!wrap || scrubBound) return;
  scrubBound = true;

  const setFromEvent = e => {
    const x = e.touches ? e.touches[0].clientX : e.clientX;
    if (x == null) return;
    toonPeiljaar(indexVanPointer(x));
  };

  wrap.addEventListener('pointerdown', e => {
    wrap.setPointerCapture?.(e.pointerId);
    setFromEvent(e);
  });
  wrap.addEventListener('pointermove', e => {
    if (e.pointerType === 'mouse' || wrap.hasPointerCapture?.(e.pointerId)) {
      setFromEvent(e);
    }
  });
  wrap.addEventListener('mousemove', setFromEvent);
  wrap.addEventListener('pointerleave', () => {
    if (scrubData.length) toonPeiljaar(scrubData.length - 1);
  });

  wrap.addEventListener('keydown', e => {
    if (!scrubData.length) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      toonPeiljaar(scrubIdx - 1);
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      toonPeiljaar(scrubIdx + 1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      toonPeiljaar(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      toonPeiljaar(scrubData.length - 1);
    }
  });
}

function tekenSpark(w) {
  const svg = $('spark');
  const wrap = $('woz-spark');
  if (!svg || !w?.length) return;

  scrubData = w;
  const n = w.length;
  const min = Math.min(...w.map(x => x.waarde));
  const max = Math.max(...w.map(x => x.waarde));
  const X = i => xAt(i, n);
  const Y = v => yAt(v, min, max);
  const pts = w.map((x, i) => `${X(i).toFixed(1)},${Y(x.waarde).toFixed(1)}`);
  const lijn = 'M' + pts.join(' L');
  const last = n - 1;
  const vlak = lijn + ` L${X(last).toFixed(1)},${VIEW_H - PAD_BOT + 4} L${X(0).toFixed(1)},${VIEW_H - PAD_BOT + 4} Z`;
  const cx = X(last);
  const cy = Y(w[last].waarde);

  const dots = w.map((x, i) =>
    `<circle class="woz-punt" cx="${X(i).toFixed(1)}" cy="${Y(x.waarde).toFixed(1)}" r="2.2" />`
  ).join('');

  svg.setAttribute('viewBox', `0 0 ${VIEW_W} ${VIEW_H}`);
  svg.innerHTML = SPARK_DEFS +
    `<path class="vlak" d="${vlak}"/>
     <path class="lijn" d="${lijn}"/>
     ${dots}
     <line class="woz-gids" x1="${cx}" y1="${PAD_TOP - 2}" x2="${cx}" y2="${VIEW_H - PAD_BOT + 6}"/>
     <circle class="woz-knop" cx="${cx}" cy="${cy}" r="6"/>
     <text x="${PAD_X}" y="${VIEW_H - 2}">${w[0].jaar}</text>
     <text x="${VIEW_W - PAD_X}" y="${VIEW_H - 2}" text-anchor="end">${w[last].jaar}</text>`;

  if (wrap) {
    wrap.setAttribute('aria-valuemin', String(w[0].jaar));
    wrap.setAttribute('aria-valuemax', String(w[last].jaar));
  }

  bindScrub();
  // Altijd starten bij meest actuele peiljaar
  toonPeiljaar(last);
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
    scrubData = [];
    $('woz-status').innerHTML = msg;
    $('woz-status').className = isError ? 'status f' : 'status';
    $('woz-inhoud').style.display = 'none';
    dossierState.klaar.woz = true;
  };
  const loketLink = `<a href="https://www.wozwaardeloket.nl/" target="_blank" rel="noopener">WOZ-waardeloket</a>`;
  if (!naId) {
    return fallback(`Geen nummeraanduiding bekend voor dit adres. Controleer het in het ${loketLink}.`);
  }
  try {
    const r = await fetch(apiUrl(`/api/woz?na=${encodeURIComponent(naId)}`));
    const j = await r.json().catch(() => ({}));

    if (r.status === 404) {
      return fallback(
        j.error ||
          `Geen WOZ-waarde gevonden — het WOZ-loket toont alleen woningen. Dit adres is waarschijnlijk geen woonfunctie. Bekijk het ${loketLink}.`,
        false,
      );
    }
    if (r.status === 429) {
      return fallback(
        `WOZ tijdelijk beperkt (te veel verzoeken). Wacht even en probeer opnieuw, of bekijk het ${loketLink}.`,
      );
    }
    if (!r.ok) {
      return fallback(
        j.error
          ? `${j.error} Bekijk het ${loketLink}.`
          : `Kon de WOZ-koppeling niet bereiken. Zoek dit adres direct op in het ${loketLink}.`,
      );
    }

    const w = Array.isArray(j.wozWaarden) ? j.wozWaarden : [];
    if (!w.length) {
      return fallback(`Geen WOZ-waarden beschikbaar voor dit adres. Bekijk het ${loketLink}.`, false);
    }

    const reeks = w.slice(-12);
    const laatste = reeks[reeks.length - 1];
    const kort = '€ ' + Math.round(laatste.waarde / 1000) + 'k';
    klaarStat(kort);
    dossierState.wozKort = kort;
    dossierState.wozBedrag = fmtEur(laatste.waarde);
    dossierState.wozRijen = w.map(x => ({ jaar: x.jaar, waarde: x.waarde }));

    if (reeks.length > 1) {
      const vorig = reeks[reeks.length - 2].waarde;
      const d = ((laatste.waarde - vorig) / vorig * 100);
      dossierState.wozDelta = (d >= 0 ? '▲ +' : '▼ ') + d.toFixed(1) + '% j/j';
    } else {
      dossierState.wozDelta = '';
    }

    tekenSpark(reeks);
    $('woz-status').textContent = '';
    $('woz-inhoud').style.display = 'block';
    dossierState.klaar.woz = true;
  } catch (e) {
    console.warn('WOZ:', e?.message || e);
    fallback(`Kon de WOZ-koppeling niet bereiken. Open Pandloket via <code>npm start</code> (poort 3000) of zoek dit adres in het ${loketLink}.`);
  }
}
