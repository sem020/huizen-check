import { LS, $ } from './config.js';
import { splitsNaam } from './utils.js';
import { openDossier, toonDossier } from './dossier.js';

let deb;

function netwerkFout(melding) {
  melding.style.display = 'block';
  melding.innerHTML = `Geen verbinding met de PDOK-API. <b>Bekijk je dit in een sandbox-preview?</b> Die blokkeert externe API's — start een lokale server of zet het op je hosting.`;
}

export function initSearch() {
  const input = $('adres');
  const sug = $('sug');
  const melding = $('melding');

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
  try {
    const r = await fetch(`${LS}/suggest?q=${encodeURIComponent(q)}&fq=type:adres&rows=7`);
    const docs = (await r.json()).response?.docs || [];
    sug.innerHTML = '';
    docs.forEach(d => {
      const [straat, rest] = splitsNaam(d.weergavenaam);
      const b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = `<span>${straat}</span><small>${rest}</small>`;
      b.addEventListener('click', () => {
        sug.style.display = 'none';
        input.value = d.weergavenaam;
        openDossier(d.id).catch(() => netwerkFout(melding));
      });
      sug.appendChild(b);
    });
    sug.style.display = docs.length ? 'block' : 'none';
    melding.style.display = 'none';
  } catch {
    netwerkFout(melding);
  }
}

async function zoekDirect(q, melding) {
  if (q.length < 3) return;
  try {
    const r = await fetch(`${LS}/free?q=${encodeURIComponent(q)}&fq=type:adres&rows=1&fl=*`);
    const doc = (await r.json()).response?.docs?.[0];
    if (doc) toonDossier(doc);
    else {
      melding.style.display = 'block';
      melding.textContent = 'Geen adres gevonden — probeer straat + huisnummer + plaats.';
    }
  } catch {
    netwerkFout(melding);
  }
}
