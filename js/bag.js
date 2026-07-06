import { WFS, $ } from './config.js';
import { padBag } from './utils.js';
import { dossierState } from './state.js';
import { updatePremiumUi } from './premium.js';

function bagFilter(field, value) {
  return `<Filter><PropertyIsEqualTo><PropertyName>${field}</PropertyName><Literal>${value}</Literal></PropertyIsEqualTo></Filter>`;
}

async function bagWfs(typeName, id) {
  const ident = padBag(id);
  if (!ident) return null;
  const params = new URLSearchParams({
    service: 'WFS', version: '2.0.0', request: 'GetFeature',
    typeName, outputFormat: 'application/json', count: '1',
    filter: bagFilter('identificatie', ident),
  });
  const props = (await (await fetch(`${WFS}?${params}`)).json()).features?.[0]?.properties;
  return props && padBag(props.identificatie) === ident ? props : null;
}

export async function laadBag(doc) {
  const klaar = (id, tekst) => { const el = $(id); el.classList.remove('skelet'); el.textContent = tekst; };
  try {
    const vboId = doc.adresseerbaarobject_id;
    if (!vboId) throw new Error('geen id');
    const vbo = await bagWfs('bag:verblijfsobject', vboId);
    if (!vbo) throw new Error('vbo niet gevonden');

    const opp = vbo.oppervlakte ? vbo.oppervlakte + ' m²' : '—';
    const bouw = vbo.bouwjaar || '—';
    klaar('s-opp', opp);
    klaar('s-bouwjaar', bouw);
    dossierState.bouwjaar = bouw;
    dossierState.oppervlak = opp;

    const chipTeksten = [];
    if (vbo.gebruiksdoel) chipTeksten.push(...String(vbo.gebruiksdoel).split(',').map(s => s.trim()));
    if (doc.buurtnaam) chipTeksten.push('buurt: ' + doc.buurtnaam);
    if (doc.gemeentenaam) chipTeksten.push(doc.gemeentenaam);
    if (vbo.pandstatus) chipTeksten.push(vbo.pandstatus);
    dossierState.chips = chipTeksten;

    const chips = [];
    if (vbo.gebruiksdoel) chips.push(...String(vbo.gebruiksdoel).split(',').map(s => `<span class="chip g">${s.trim()}</span>`));
    if (doc.buurtnaam) chips.push(`<span class="chip">buurt: ${doc.buurtnaam}</span>`);
    if (doc.gemeentenaam) chips.push(`<span class="chip">${doc.gemeentenaam}</span>`);
    if (vbo.pandstatus) chips.push(`<span class="chip">${vbo.pandstatus}</span>`);
    $('chips').innerHTML = chips.join('');
  } catch {
    klaar('s-bouwjaar', '—'); klaar('s-opp', '—');
    $('chips').innerHTML = `<span class="chip">BAG-details tijdelijk niet bereikbaar — <a style="color:var(--accent)" href="https://bagviewer.kadaster.nl/" target="_blank" rel="noopener">open BAG Viewer</a></span>`;
  }
  dossierState.klaar.bag = true;
  updatePremiumUi();
}
