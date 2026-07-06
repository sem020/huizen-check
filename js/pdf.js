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
  const basis = (dossierState.adres || 'panddossier')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `panddossier-${basis || 'export'}.html`;
}

function wozTabel(rijen) {
  if (!rijen.length) return '<p class="leeg">Geen WOZ-waarden beschikbaar voor dit adres.</p>';
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

function bouwHtml() {
  const s = dossierState;
  const datum = new Date().toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });
  const chips = s.chips.length
    ? `<p class="chips">${s.chips.map(c => esc(c)).join(' · ')}</p>`
    : '';

  return `<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="UTF-8">
<title>Panddossier — ${esc(s.adres)}</title>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Plus Jakarta Sans',system-ui,sans-serif;color:#0f172a;padding:40px 44px;font-size:11pt;line-height:1.5;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .merk{font-size:.68rem;font-weight:700;color:#0d9488;letter-spacing:.1em;text-transform:uppercase;margin-bottom:28px}
  h1{font-size:1.65rem;font-weight:800;letter-spacing:-.03em;margin-bottom:4px;line-height:1.15}
  .plaats{color:#475569;font-size:.9rem;font-weight:500;margin-bottom:22px}
  .stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px}
  .stat{background:#f1f5f9;border-radius:14px;padding:14px 12px}
  .stat .n{font-size:1.35rem;font-weight:800;letter-spacing:-.02em}
  .stat .l{font-size:.65rem;text-transform:uppercase;letter-spacing:.06em;color:#475569;margin-top:6px;font-weight:600}
  h2{font-size:.68rem;text-transform:uppercase;letter-spacing:.08em;color:#475569;margin:22px 0 10px;font-weight:700}
  .tabel{width:100%;border-collapse:collapse;font-size:.88rem}
  .tabel th,.tabel td{padding:8px 10px;text-align:left;border-bottom:1px solid #e2e8f0}
  .tabel th{color:#475569;font-weight:700;font-size:.68rem;text-transform:uppercase;letter-spacing:.08em}
  .woz-hoofd{font-size:1.1rem;font-weight:800;margin-bottom:8px}
  .woz-delta{font-size:.78rem;font-weight:700;color:#059669}
  .chips{color:#475569;font-size:.72rem;margin-bottom:8px;font-weight:600}
  .leeg{color:#475569;font-size:.84rem}
  .bronnen{list-style:none;padding:0}
  .bronnen li{padding:10px 0;border-bottom:1px solid rgba(15,23,42,.06);font-size:.88rem}
  .bronnen li strong{font-weight:700}
  .url{color:#0d9488;font-size:.76rem;word-break:break-all;font-weight:500}
  .disclaimer{margin-top:32px;padding-top:16px;border-top:1px solid #e2e8f0;font-size:.68rem;color:#64748b;line-height:1.5;font-weight:500}
  @media print{body{padding:24px}@page{margin:16mm}}
</style>
</head>
<body>
  <div class="merk">Panddossier</div>
  <h1>${esc(s.adres)}</h1>
  <div class="plaats">${esc(s.plaats)}</div>
  <div class="stats">
    <div class="stat"><div class="n">${esc(s.bouwjaar)}</div><div class="l">Bouwjaar</div></div>
    <div class="stat"><div class="n">${esc(s.oppervlak)}</div><div class="l">Oppervlak</div></div>
    <div class="stat"><div class="n">${esc(s.wozKort)}</div><div class="l">WOZ</div></div>
  </div>
  ${chips}
  <h2>WOZ-waardeverloop</h2>
  ${s.wozBedrag !== '—' ? `<p class="woz-hoofd">${esc(s.wozBedrag)}${s.wozDelta ? ` <span class="woz-delta">${esc(s.wozDelta)}</span>` : ''}</p>` : ''}
  ${wozTabel(s.wozRijen)}
  <h2>Officiële bronnen</h2>
  ${bronnenLijst(s.bronnen)}
  <div class="disclaimer">
    Panddossier · gegenereerd op ${esc(datum)}<br>
    Gegevens uit openbare registers (Kadaster/PDOK, Waarderingskamer). Geen officiële taxatie.
    Fouten voorbehouden; hieraan kunnen geen rechten worden ontleend.
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
