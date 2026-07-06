import { NL_CENTER, NL_ZOOM, MARKER_COLOR, MARKER_FILL } from './config.js';

let map = null;
let marker = null;
let klaar = false;

function initMap() {
  if (klaar) return map;
  if (typeof L === 'undefined') {
    console.error('Leaflet niet geladen — controleer je internetverbinding.');
    return null;
  }
  const el = document.getElementById('map');
  if (!el) return null;

  map = L.map(el, { zoomControl: true, attributionControl: true });
  L.tileLayer('https://service.pdok.nl/brt/achtergrondkaart/wmts/v2_0/grijs/EPSG:3857/{z}/{x}/{y}.png', {
    attribution: 'Kaart © <a href="https://www.pdok.nl">PDOK/Kadaster</a>',
    maxZoom: 19,
  }).addTo(map);

  klaar = true;
  toonNlOverzicht(false);
  window.addEventListener('resize', () => {
    if (!$stageOpen()) return;
    toonNlOverzicht(false);
  });
  return map;
}

/** Centreer NL in het zichtbare kaartdeel (rechts op desktop, boven op mobiel). */
export function toonNlOverzicht(animate = false) {
  const m = initMap();
  if (!m) return;

  const breed = window.innerWidth;
  const hoog = window.innerHeight;
  const mobiel = breed <= 900;
  const zoom = mobiel ? 7.3 : NL_ZOOM;

  m.setView(NL_CENTER, zoom, { animate });

  requestAnimationFrame(() => {
    if (mobiel) {
      m.panBy([0, Math.round(hoog * 0.14)], { animate });
    } else {
      m.panBy([-Math.round(breed * 0.14), Math.round(hoog * 0.04)], { animate });
    }
  });
}

function $stageOpen() {
  const stage = document.getElementById('stage');
  return stage && !stage.classList.contains('weg');
}

export function toonLocatie(lat, lon) {
  const m = initMap();
  if (!m || !lat) return;
  if (marker) marker.remove();
  marker = L.circleMarker([lat, lon], {
    radius: 10,
    color: MARKER_COLOR,
    weight: 2.5,
    fillColor: MARKER_FILL,
    fillOpacity: .35,
  }).addTo(m);
  const doel = window.innerWidth > 640 ? [lat, lon - 0.0022] : [lat + 0.0012, lon];
  m.flyTo(doel, 17, { duration: 1.4 });
}

export function resetKaart() {
  if (marker) { marker.remove(); marker = null; }
  toonNlOverzicht(true);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initMap);
} else {
  initMap();
}
