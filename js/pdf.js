import { fmtEur } from './utils.js';
import { dossierState } from './state.js';

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function bestandsnaam() {
  const basis = (dossierState.adres || 'pandloket')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `pandloket-${basis || 'export'}.html`;
}

function fmtDatum(iso) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return null;
  }
}

function labelClass(k) {
  const x = String(k || '').toUpperCase();
  if (x.startsWith('A')) return 'a';
  if (x === 'B') return 'b';
  if (x === 'C') return 'c';
  if (x === 'D') return 'd';
  if (x === 'E') return 'e';
  if (x === 'F' || x === 'G') return 'fg';
  return 'x';
}

function bouwHtml() {
  const s = dossierState;
  const datum = new Date().toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });
  const chips = s.chips.length
    ? `<p class="chips">${s.chips.slice(0, 6).map(c => esc(c)).join(' · ')}</p>`
    : '';

  const wozRijen = (s.wozRijen || []).slice().reverse();
  const wozTabel = wozRijen.length
    ? `<table class="tabel"><thead><tr><th>Peiljaar</th><th>WOZ-waarde</th></tr></thead><tbody>${
      wozRijen.map(r => `<tr><td>${r.jaar}</td><td>${esc(fmtEur(r.waarde))}</td></tr>`).join('')
    }</tbody></table>`
    : '<p class="leeg">Geen WOZ-waarden beschikbaar.</p>';

  const el = s.energielabel;
  const mon = s.monumenten;
  const cbs = s.cbs;
  const nabij = s.nabijheid;
  const ov = s.ov;

  const elCard = el?.klasse
    ? `<div class="mini"><div class="mini-l">Energielabel</div><div class="mini-row"><span class="badge ${labelClass(el.klasse)}">${esc(el.klasse)}</span><div><strong>Label ${esc(el.klasse)}</strong><div class="sub">${esc([el.gebouwtype, el.geldigTot ? 'geldig tot ' + fmtDatum(el.geldigTot) : null].filter(Boolean).join(' · '))}</div></div></div></div>`
    : `<div class="mini"><div class="mini-l">Energielabel</div><p class="leeg">Geen geregistreerd label.</p></div>`;

  let monBody = '<p class="leeg">Geen rijksmonument in de directe omgeving.</p>';
  if (mon?.isMonument && mon.dichtstbij) {
    monBody = `<strong>Rijksmonument</strong><div class="sub">${esc(mon.dichtstbij.naam || '')}${mon.dichtstbij.afstandM != null ? ` · ± ${mon.dichtstbij.afstandM} m` : ''}</div>`;
  } else if (mon?.aantalInBuurt > 0) {
    monBody = `<strong>${mon.aantalInBuurt} in de buurt</strong><div class="sub">Binnen ± 60 m</div>`;
  }
  const monCard = `<div class="mini"><div class="mini-l">Monumenten</div>${monBody}</div>`;

  const cbsBlock = cbs?.buurt ? `
    <h2><i></i>Buurt (CBS)</h2>
    <p class="buurt-naam">${esc(cbs.buurt)}${cbs.gemeente ? ', ' + esc(cbs.gemeente) : ''}</p>
    <div class="cbs">
      <div><b>${cbs.inwoners?.toLocaleString('nl-NL') ?? '—'}</b><span>Inwoners</span></div>
      <div><b>${cbs.huishoudens?.toLocaleString('nl-NL') ?? '—'}</b><span>Huishoudens</span></div>
      <div><b>${cbs.woningen?.toLocaleString('nl-NL') ?? '—'}</b><span>Woningen</span></div>
      <div><b>${cbs.gemWoz != null ? fmtEur(Math.round(cbs.gemWoz)) : '—'}</b><span>Gem. WOZ</span></div>
      <div><b>${cbs.pctKoop != null ? cbs.pctKoop + '%' : '—'}</b><span>Koop</span></div>
      <div><b>${cbs.pctHuur != null ? cbs.pctHuur + '%' : '—'}</b><span>Huur</span></div>
    </div>` : '';

  function fmtKm(km) {
    if (km == null) return '—';
    if (km < 1) return Math.round(km * 1000) + ' m';
    return Number(km).toLocaleString('nl-NL', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' km';
  }
  const a = nabij?.afstanden;
  const sm = nabij?.supermarket;
  const smRegel = sm
    ? `<p class="buurt-naam"><strong>${esc(sm.naam)}</strong> · ${sm.afstandM < 1000 ? sm.afstandM + ' m' : (sm.afstandM / 1000).toLocaleString('nl-NL', { maximumFractionDigits: 1 }) + ' km'} <span style="color:#64748b;font-weight:500">(vanaf dit adres)</span></p>`
    : '';
  const nabijBlock = (a || sm) ? `
    <h2><i></i>Nabijheid</h2>
    ${smRegel}
    ${nabij?.buurt ? `<p class="buurt-naam">Buurtgemiddelde ${esc(nabij.buurt)}${nabij.jaar ? ` (${nabij.jaar})` : ''}</p>` : ''}
    <div class="cbs">
      <div><b>${fmtKm(a?.huisarts)}</b><span>Huisarts</span></div>
      <div><b>${fmtKm(a?.basisschool)}</b><span>Basisschool</span></div>
      <div><b>${fmtKm(a?.kinderopvang)}</b><span>Kinderopvang</span></div>
      <div><b>${fmtKm(a?.treinstation)}</b><span>Treinstation</span></div>
      <div><b>${fmtKm(a?.bibliotheek)}</b><span>Bibliotheek</span></div>
      <div><b>${fmtKm(a?.apotheek)}</b><span>Apotheek</span></div>
    </div>` : '';

  const ovRows = (ov?.halten || []).slice(0, 5).map(h => {
    const soort = ({ bus: 'Bus', tram: 'Tram', metro: 'Metro', trein: 'Trein', ov: 'OV' })[h.soort] || 'OV';
    const afst = h.afstandM < 1000 ? `${h.afstandM} m` : `${(h.afstandM / 1000).toLocaleString('nl-NL', { maximumFractionDigits: 1 })} km`;
    return `<div class="ov-row"><span class="ov-s">${esc(soort)}</span><span>${esc(h.naam)}</span><strong>${esc(afst)}</strong></div>`;
  }).join('');
  const ovBlock = ovRows ? `
    <h2><i></i>Dichtstbijzijnde OV</h2>
    <div class="ov">${ovRows}</div>` : '';

  return `<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="UTF-8">
<title>Pandloket — ${esc(s.adres)}</title>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Plus Jakarta Sans',system-ui,sans-serif;color:#0f172a;font-size:10.5pt;line-height:1.45;
    -webkit-print-color-adjust:exact;print-color-adjust:exact}
  .head{background:#0f172a;color:#fff;padding:22px 36px 20px}
  .merk{font-size:.68rem;font-weight:800;color:#2dd4bf;letter-spacing:.14em;text-transform:uppercase}
  .head-sub{font-size:.72rem;color:#94a3b8;margin-top:4px}
  .head-datum{float:right;font-size:.72rem;color:#cbd5e1;margin-top:-28px}
  .wrap{padding:28px 36px 36px}
  h1{font-size:1.55rem;font-weight:800;letter-spacing:-.03em;line-height:1.15;margin-bottom:4px}
  .plaats{color:#475569;font-size:.9rem;font-weight:500;margin-bottom:14px}
  .chips{color:#64748b;font-size:.72rem;font-weight:600;margin-bottom:18px}
  h2{font-size:.68rem;letter-spacing:.1em;text-transform:uppercase;color:#0f172a;font-weight:800;
    margin:22px 0 12px;display:flex;align-items:center;gap:8px}
  h2 i{display:inline-block;width:3px;height:11px;background:#0d9488;border-radius:2px}
  .kpi{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:8px}
  .kpi > div{background:#f1f5f9;border-radius:12px;padding:12px}
  .kpi .n{font-size:1.15rem;font-weight:800;letter-spacing:-.02em}
  .kpi .l{font-size:.62rem;letter-spacing:.06em;text-transform:uppercase;color:#64748b;font-weight:700;margin-top:4px}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:4px}
  .mini{background:#f1f5f9;border-radius:12px;padding:14px}
  .mini-l{font-size:.62rem;letter-spacing:.08em;text-transform:uppercase;color:#64748b;font-weight:800;margin-bottom:8px}
  .mini-row{display:flex;align-items:center;gap:12px}
  .badge{width:36px;height:36px;border-radius:9px;display:flex;align-items:center;justify-content:center;
    color:#fff;font-weight:800;font-size:1rem;flex-shrink:0}
  .badge.a{background:#059669}.badge.b{background:#65a30d}.badge.c{background:#ca8a04}
  .badge.d{background:#ea580c}.badge.e{background:#dc2626}.badge.fg{background:#991b1b}.badge.x{background:#94a3b8}
  .sub{font-size:.78rem;color:#475569;font-weight:500;margin-top:3px;line-height:1.35}
  .buurt-naam{font-weight:700;margin-bottom:10px;color:#475569;font-size:.88rem}
  .cbs{display:grid;grid-template-columns:repeat(6,1fr);gap:8px}
  .cbs > div{background:#f1f5f9;border-radius:10px;padding:10px 6px;text-align:center}
  .cbs b{display:block;font-size:.88rem;font-weight:800}
  .cbs span{display:block;font-size:.58rem;letter-spacing:.05em;text-transform:uppercase;color:#64748b;font-weight:700;margin-top:3px}
  .ov{display:flex;flex-direction:column;gap:6px}
  .ov-row{display:grid;grid-template-columns:56px 1fr auto;gap:10px;align-items:center;background:#f1f5f9;border-radius:10px;padding:8px 12px;font-size:.84rem}
  .ov-s{font-size:.58rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#0d9488}
  .ov-row strong{font-weight:800;color:#475569}
  .woz-n{font-size:1.35rem;font-weight:800;letter-spacing:-.02em}
  .woz-d{font-size:.8rem;font-weight:700;color:#059669;margin-left:8px}
  .tabel{width:100%;border-collapse:collapse;margin-top:10px;font-size:.88rem}
  .tabel th{background:#f1f5f9;text-align:left;padding:8px 12px;font-size:.62rem;letter-spacing:.06em;
    text-transform:uppercase;color:#64748b;font-weight:800}
  .tabel td{padding:8px 12px;border-bottom:1px solid #e2e8f0;font-weight:600}
  .tabel tr:nth-child(even) td{background:#f8fafc}
  .bron{display:grid;grid-template-columns:34% 1fr;gap:12px;padding:8px 0;border-bottom:1px solid #e2e8f0;font-size:.82rem}
  .bron strong{font-weight:700}.bron span{color:#475569;font-weight:500}
  .leeg{color:#64748b;font-size:.84rem;font-weight:500}
  .foot{margin-top:28px;padding-top:14px;border-top:1px solid #e2e8f0;font-size:.68rem;color:#64748b;line-height:1.5;font-weight:500}
  @media print{body{padding:0}.wrap{padding:22px 28px 28px}.head{padding:18px 28px 16px}@page{margin:12mm}}
</style>
</head>
<body>
  <div class="head">
    <div class="merk">Pandloket</div>
    <div class="head-sub">Openbaar woningrapport</div>
    <div class="head-datum">${esc(datum)}</div>
  </div>
  <div class="wrap">
    <h1>${esc(s.adres)}</h1>
    <div class="plaats">${esc(s.plaats)}</div>
    ${chips}
    <h2><i></i>Kerngegevens</h2>
    <div class="kpi">
      <div><div class="n">${esc(s.bouwjaar)}</div><div class="l">Bouwjaar</div></div>
      <div><div class="n">${esc(s.oppervlak)}</div><div class="l">Oppervlak</div></div>
      <div><div class="n">${esc(s.wozKort)}</div><div class="l">WOZ</div></div>
      <div><div class="n">${esc(el?.klasse || '—')}</div><div class="l">Energielabel</div></div>
    </div>
    <h2><i></i>Pand &amp; status</h2>
    <div class="grid2">${elCard}${monCard}</div>
    ${cbsBlock}
    ${nabijBlock}
    ${ovBlock}
    <h2><i></i>WOZ-waardeverloop</h2>
    ${s.wozBedrag !== '—' ? `<div class="woz-n">${esc(s.wozBedrag)}${s.wozDelta ? `<span class="woz-d">${esc(s.wozDelta)}</span>` : ''}</div>` : ''}
    ${wozTabel}
    <div class="foot">
      Pandloket · gegenereerd op ${esc(datum)}<br>
      Gegevens uit openbare registers (Kadaster/PDOK, Waarderingskamer, RCE, CBS, EP-Online). Geen officiële taxatie.
      Fouten voorbehouden; hieraan kunnen geen rechten worden ontleend.
    </div>
  </div>
  <script>window.addEventListener('load',function(){setTimeout(function(){window.print()},400)})</script>
</body>
</html>`;
}

function downloadHtml(html) {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = bestandsnaam();
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function genereerPdf() {
  if (!dossierState.adres) {
    alert('Open eerst een adres om een PDF te downloaden.');
    return false;
  }

  const html = bouwHtml();
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const tab = window.open(url, '_blank', 'noopener');
  if (tab) {
    setTimeout(() => URL.revokeObjectURL(url), 120000);
    return true;
  }

  downloadHtml(html);
  URL.revokeObjectURL(url);
  alert('Het dossier is gedownload als HTML-bestand. Open het en kies Afdrukken → Opslaan als PDF.');
  return true;
}
