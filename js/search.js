import { LS, $ } from './config.js';
import { splitsNaam } from './utils.js';
import { toonDossier } from './dossier.js';

let deb;
/** @type {{ id: string, weergavenaam: string }[]} */
let sugDocs = [];
let sugIndex = -1;

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
      'Pandloket werkt niet als los bestand. Start met <code>npm start</code> en open <code>http://localhost:3000</code>.'
    );
    return false;
  }
  return true;
}

function zetExpanded(input, open) {
  input.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function sluitSug(input, sug) {
  sug.style.display = 'none';
  sug.innerHTML = '';
  sugDocs = [];
  sugIndex = -1;
  input.removeAttribute('aria-activedescendant');
  zetExpanded(input, false);
}

function markeerSug(sug, input) {
  const knoppen = [...sug.querySelectorAll('[role="option"]')];
  knoppen.forEach((b, i) => {
    const actief = i === sugIndex;
    b.setAttribute('aria-selected', actief ? 'true' : 'false');
    b.classList.toggle('actief', actief);
  });
  if (sugIndex >= 0 && knoppen[sugIndex]) {
    input.setAttribute('aria-activedescendant', knoppen[sugIndex].id);
    knoppen[sugIndex].scrollIntoView({ block: 'nearest' });
  } else {
    input.removeAttribute('aria-activedescendant');
  }
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

async function kiesSuggestie(d, input, sug, melding) {
  sluitSug(input, sug);
  input.value = d.weergavenaam;
  try {
    let doc = await haalAdresOpId(d.id);
    if (!doc) doc = await haalAdresOp(d.weergavenaam);
    await openAdres(doc, melding);
  } catch {
    netwerkFout(melding);
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
    if (q.length < 3) {
      sluitSug(input, sug);
      return;
    }
    deb = setTimeout(() => suggereer(q, input, sug, melding), 220);
  });

  input.addEventListener('keydown', e => {
    const open = sug.style.display === 'block' && sugDocs.length > 0;
    if (e.key === 'ArrowDown' && open) {
      e.preventDefault();
      sugIndex = Math.min(sugDocs.length - 1, sugIndex + 1);
      markeerSug(sug, input);
      return;
    }
    if (e.key === 'ArrowUp' && open) {
      e.preventDefault();
      sugIndex = Math.max(0, sugIndex - 1);
      markeerSug(sug, input);
      return;
    }
    if (e.key === 'Escape') {
      if (open) {
        e.preventDefault();
        sluitSug(input, sug);
      }
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (open && sugIndex >= 0 && sugDocs[sugIndex]) {
        kiesSuggestie(sugDocs[sugIndex], input, sug, melding);
      } else {
        sluitSug(input, sug);
        zoekDirect(input.value.trim(), melding);
      }
    }
  });

  document.addEventListener('click', e => {
    if (!e.target.closest('.zoek')) sluitSug(input, sug);
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
    sugDocs = docs;
    sugIndex = -1;
    docs.forEach((d, i) => {
      const [straat, rest] = splitsNaam(d.weergavenaam);
      const b = document.createElement('button');
      b.type = 'button';
      b.id = `sug-opt-${i}`;
      b.setAttribute('role', 'option');
      b.setAttribute('aria-selected', 'false');
      b.innerHTML = `<span>${straat}</span><small>${rest}</small>`;
      b.addEventListener('click', () => kiesSuggestie(d, input, sug, melding));
      sug.appendChild(b);
    });
    if (docs.length) {
      sug.style.display = 'block';
      zetExpanded(input, true);
    } else {
      sluitSug(input, sug);
    }
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

/** Open dossier vanuit /pand/…, ?id= of ?q=. */
export async function openVanShareUrl(melding) {
  const params = new URLSearchParams(location.search);
  const id = params.get('id');
  const qParam = params.get('q');
  const slugMatch = location.pathname.match(/^\/pand\/([^/]+)\/?$/);
  const slugQ = slugMatch
    ? decodeURIComponent(slugMatch[1]).replace(/-/g, ' ').replace(/\s+/g, ' ').trim()
    : '';
  const q = qParam || slugQ;
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
