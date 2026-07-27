import { LS, $ } from './config.js';
import { splitsNaam } from './utils.js';
import { toonDossier } from './dossier.js';

let deb;

function toonFout(melding, html) {
  melding.style.display = 'block';
  melding.innerHTML = html;
}

function verbergFout(melding) {
  melding.style.display = 'none';
  melding.textContent = '';
}

function netwerkFout(melding) {
  toonFout(melding,
    `Geen verbinding met de PDOK-API. Open Pandloket via een <b>lokale server</b> of je hosting — niet als bestand op je computer (<code>file://</code>).`
  );
}

function protocolCheck(melding) {
  if (location.protocol === 'file:') {
    toonFout(melding,
      'Pandloket werkt niet als los bestand. Start een lokale server: <code>python3 -m http.server 8000</code> en open <code>http://localhost:8000</code>.'
    );
    return false;
  }
  return true;
}

async function haalAdresOp(query) {
  const r = await fetch(`${LS}/free?q=${encodeURIComponent(query)}&fq=type:adres&rows=1&fl=*`);
  if (!r.ok) throw new Error('pdok ' + r.status);
  return (await r.json()).response?.docs?.[0] || null;
}

async function haalAdresOpId(id) {
  const r = await fetch(`${LS}/lookup?id=${encodeURIComponent(id)}&fl=*`);
  if (!r.ok) throw new Error('pdok ' + r.status);
  return (await r.json()).response?.docs?.[0] || null;
}

async function openAdres(doc, melding) {
  if (!doc?.weergavenaam) {
    toonFout(melding, 'Geen adres gevonden — probeer straat + huisnummer + plaats.');
    return;
  }
  try {
    verbergFout(melding);
    await toonDossier(doc);
  } catch (e) {
    console.error(e);
    toonFout(melding, 'Kon het dossier niet openen. Vernieuw de pagina en probeer opnieuw.');
  }
}

export function initSearch() {
  const input = $('adres');
  const sug = $('sug');
  const melding = $('melding');

  protocolCheck(melding);

  input.addEventListener('input', () => {
    clearTimeout(deb);
    const q = input.value.trim();
    if (q.length < 3) { sug.style.display = 'none'; return; }
    deb = setTimeout(() => suggereer(q, input, sug, melding), 220);
  });

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); zoekDirect(input.value.trim(), melding); }
  });

  $('voorbeelden').addEventListener('click', e => {
    if (e.target.tagName === 'BUTTON') {
      input.value = e.target.textContent;
      zoekDirect(e.target.textContent, melding);
    }
  });

  document.addEventListener('click', e => {
    if (!e.target.closest('.zoek')) sug.style.display = 'none';
  });

  return { input, melding };
}

async function suggereer(q, input, sug, melding) {
  if (!protocolCheck(melding)) return;
  try {
    const r = await fetch(`${LS}/suggest?q=${encodeURIComponent(q)}&fq=type:adres&rows=7`);
    if (!r.ok) throw new Error('pdok ' + r.status);
    const docs = (await r.json()).response?.docs || [];
    sug.innerHTML = '';
    docs.forEach(d => {
      const [straat, rest] = splitsNaam(d.weergavenaam);
      const b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = `<span>${straat}</span><small>${rest}</small>`;
      b.addEventListener('click', async () => {
        sug.style.display = 'none';
        input.value = d.weergavenaam;
        try {
          let doc = await haalAdresOpId(d.id);
          if (!doc) doc = await haalAdresOp(d.weergavenaam);
          await openAdres(doc, melding);
        } catch {
          netwerkFout(melding);
        }
      });
      sug.appendChild(b);
    });
    sug.style.display = docs.length ? 'block' : 'none';
    verbergFout(melding);
  } catch {
    netwerkFout(melding);
  }
}

export async function zoekDirect(q, melding) {
  if (q.length < 3) return;
  if (!protocolCheck(melding)) return;
  try {
    const doc = await haalAdresOp(q);
    await openAdres(doc, melding);
  } catch {
    netwerkFout(melding);
  }
}

/** Open dossier vanuit ?id= of ?q= in de URL. */
export async function openVanShareUrl(melding) {
  const params = new URLSearchParams(location.search);
  const id = params.get('id');
  const q = params.get('q');
  if (!id && !q) return false;
  if (!protocolCheck(melding)) return false;

  const input = $('adres');
  try {
    let doc = null;
    if (id) doc = await haalAdresOpId(id);
    if (!doc && q) doc = await haalAdresOp(q);
    if (!doc) {
      toonFout(melding, 'Dit gedeelde adres kon niet worden gevonden.');
      return false;
    }
    if (input) input.value = doc.weergavenaam || q || '';
    await openAdres(doc, melding);
    return true;
  } catch {
    netwerkFout(melding);
    return false;
  }
}
