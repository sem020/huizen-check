import { NL_CENTER, NL_ZOOM, MARKER_COLOR, MARKER_FILL } from './config.js';

let marker = null;

export const map = L.map('map', { zoomControl: true, attributionControl: true });

L.tileLayer('https://service.pdok.nl/brt/achtergrondkaart/wmts/v2_0/grijs/EPSG:3857/{z}/{x}/{y}.png', {
  attribution: 'Kaart © <a href="https://www.pdok.nl">PDOK/Kadaster</a>',
  maxZoom: 19,
}).addTo(map);

/** Centreer NL in het zichtbare kaartdeel (rechts op desktop, boven op mobiel). */
export function toonNlOverzicht(animate = false) {
  const breed = window.innerWidth;
  const hoog = window.innerHeight;
  const mobiel = breed <= 900;
  const zoom = mobiel ? 7.3 : NL_ZOOM;

  map.setView(NL_CENTER, zoom, { animate });

  requestAnimationFrame(() => {
    if (mobiel) {
      map.panBy([0, Math.round(hoog * 0.14)], { animate });
    } else {
      map.panBy([-Math.round(breed * 0.14), Math.round(hoog * 0.04)], { animate });
    }
  });
}

toonNlOverzicht(false);
window.addEventListener('resize', () => {
  if (!$stageOpen()) return;
  toonNlOverzicht(false);
});

function $stageOpen() {
  const stage = document.getElementById('stage');
  return stage && !stage.classList.contains('weg');
}

export function toonLocatie(lat, lon) {
  if (!lat) return;
  if (marker) marker.remove();
  marker = L.circleMarker([lat, lon], {
    radius: 10,
    color: MARKER_COLOR,
    weight: 2.5,
    fillColor: MARKER_FILL,
    fillOpacity: .35,
  }).addTo(map);
  const doel = window.innerWidth > 640 ? [lat, lon - 0.0022] : [lat + 0.0012, lon];
  map.flyTo(doel, 17, { duration: 1.4 });
}

export function resetKaart() {
  if (marker) { marker.remove(); marker = null; }
  toonNlOverzicht(true);
}
