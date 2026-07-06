import { $ } from './config.js';
import { parsePoint } from './utils.js';
import { dossierState } from './state.js';

export function vulBronnen(doc, lat, lon) {
  const [rdx, rdy] = parsePoint(doc.centroide_rd);
  const B = [
    ['Energielabel', 'EP-Online: geregistreerd label', 'https://www.ep-online.nl/'],
    ['WOZ-waardeloket', 'officiële WOZ-waarden', 'https://www.wozwaardeloket.nl/'],
    ['BAG Viewer', 'pandcontouren & historie (Kadaster)', 'https://bagviewer.kadaster.nl/'],
    ['3D BAG', 'het pand in 3D (TU Delft)', rdx ? `https://3dbag.nl/nl/viewer?rdx=${rdx}&rdy=${rdy}&ox=400&oy=400&oz=400&placeMarker=true` : 'https://3dbag.nl/nl/viewer'],
    ['Kadastrale kaart', 'perceelgrenzen & -nummers', 'https://kadastralekaart.com/'],
    ['Regels op de kaart', 'omgevingsplan: wat mag hier', 'https://omgevingswet.overheid.nl/regels-op-de-kaart/'],
    ['Bodemloket', 'bodemverontreiniging & sanering', 'https://www.bodemloket.nl/kaart'],
    ['Klimaateffectatlas', 'overstroming, fundering, hitte', 'https://www.klimaateffectatlas.nl/nl/'],
    ['Monumentenregister', 'rijksmonument? (RCE)', 'https://monumentenregister.cultureelerfgoed.nl/'],
    ['CBS in uw buurt', 'buurtstatistiek & bewoners', 'https://www.cbsinuwbuurt.nl/'],
    ['Street View', 'de gevel vanaf de straat', lat ? `https://www.google.com/maps?q&layer=c&cbll=${lat},${lon}` : 'https://maps.google.com'],
  ];
  dossierState.bronnen = B.map(([naam, wat, url]) => ({ naam, wat, url }));
  $('bronnen').innerHTML = B.map(([n, w, u]) =>
    `<a href="${u}" target="_blank" rel="noopener"><span class="naam">${n}</span><span class="wat">${w}</span><span class="pijl">↗</span></a>`
  ).join('');
}
