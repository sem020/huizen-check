import { fmtEur } from './utils.js';
import { dossierState } from './state.js';

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function wozTabel(rijen) {
  if (!rijen.length) return '<p>Geen WOZ-waarden beschikbaar voor dit adres.</p>';
  const rij = rijen.map(r =>
    `<tr><td>${r.jaar}</td><td>${esc(fmtEur(r.waarde))}</td></tr>`
  ).join('');
  return `<table class="tabel"><thead><tr><th>Peiljaar</th><th>WOZ-waarde</th></tr></thead><tbody>${rij}</tbody></table>`;
}

function bronnenLijst(items) {
  if (!items.length) return '';
  return `<ul class="bronnen">${items.map(b =>
    `<li><strong>${esc(b.naam)}</strong> — ${esc(b.wat)}<br><span class="url">${esc(b.url)}</span></li>`
  ).join('')}</ul>`;
}

export function genereerPdf() {
  const s = dossierState;
  const datum = new Date().toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });
  const chips = s.chips.length
    ? `<p class="chips">${s.chips.map(c => esc(c)).join(' · ')}</p>`
    : '';

  const html = `<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="UTF-8">
<title>Panddossier — ${esc(s.adres)}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:system-ui,sans-serif;color:#0f172a;padding:40px 44px;font-size:11pt;line-height:1.5}
  .merk{font-size:10pt;font-weight:700;color:#0d9488;letter-spacing:.08em;text-transform:uppercase;margin-bottom:28px}
  h1{font-size:22pt;font-weight:800;letter-spacing:-.02em;margin-bottom:4px}
  .plaats{color:#475569;font-size:12pt;margin-bottom:24px}
  .stats{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px}
  .stat{background:#f1f5f9;border-radius:10px;padding:14px}
  .stat .n{font-size:16pt;font-weight:800}
  .stat .l{font-size:8pt;text-transform:uppercase;letter-spacing:.08em;color:#64748b;margin-top:4px}
  h2{font-size:10pt;text-transform:uppercase;letter-spacing:.1em;color:#64748b;margin:24px 0 10px}
  .tabel{width:100%;border-collapse:collapse;font-size:10pt}
  .tabel th,.tabel td{padding:8px 10px;text-align:left;border-bottom:1px solid #e2e8f0}
  .tabel th{color:#64748b;font-weight:600;font-size:8pt;text-transform:uppercase}
  .chips{color:#475569;font-size:10pt;margin-bottom:8px}
  .bronnen{list-style:none;padding:0}
  .bronnen li{padding:8px 0;border-bottom:1px solid #e2e8f0;font-size:10pt}
  .url{color:#0d9488;font-size:9pt;word-break:break-all}
  .disclaimer{margin-top:32px;padding-top:16px;border-top:1px solid #e2e8f0;font-size:8pt;color:#64748b}
  @media print{body{padding:24px}}
</style>
</head>
<body>
  <div class="merk">Panddossier</div>
  <h1>${esc(s.adres)}</h1>
  <div class="plaats">${esc(s.plaats)}</div>
  <div class="stats">
    <div class="stat"><div class="n">${esc(s.bouwjaar)}</div><div class="l">Bouwjaar</div></div>
    <div class="stat"><div class="n">${esc(s.oppervlak)}</div><div class="l">Oppervlak</div></div>
    <div class="stat"><div class="n">${esc(s.wozKort)}</div><div class="l">WOZ (laatste)</div></div>
  </div>
  ${chips}
  <h2>WOZ-waardeverloop</h2>
  ${s.wozBedrag !== '—' ? `<p><strong>${esc(s.wozBedrag)}</strong>${s.wozDelta ? ` &nbsp; ${esc(s.wozDelta)}` : ''}</p>` : ''}
  ${wozTabel(s.wozRijen)}
  <h2>Officiële bronnen</h2>
  ${bronnenLijst(s.bronnen)}
  <div class="disclaimer">
    Panddossier · gegenereerd op ${esc(datum)}<br>
    Gegevens uit openbare registers (Kadaster/PDOK, Waarderingskamer). Geen officiële taxatie.
    Fouten voorbehouden; hieraan kunnen geen rechten worden ontleend.
    Zie panddossier.nl/av voor voorwaarden.
  </div>
</body>
</html>`;

  const venster = window.open('', '_blank');
  if (!venster) {
    alert('Pop-up geblokkeerd. Sta pop-ups toe om de PDF te downloaden.');
    return false;
  }
  venster.document.write(html);
  venster.document.close();
  venster.onload = () => { venster.focus(); venster.print(); };
  return true;
}
