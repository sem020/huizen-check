import { NL_CENTER, NL_ZOOM, MARKER_COLOR, MARKER_FILL } from './config.js';

let map = null;
let marker = null;
/** @type {import('leaflet').LayerGroup | null} */
let poiLaag = null;
let klaar = false;
let overgangTimer = null;

const OV_KLEUR = '#0369a1';
const OV_VUL = '#38bdf8';
const SM_KLEUR = '#c2410c';
const SM_VUL = '#fb923c';

function initMap() {
  if (klaar) return map;
  if (typeof L === 'undefined') {
    console.error('Leaflet niet geladen — controleer je internetverbinding.');
    return null;
  }
  const el = document.getElementById('map');
  if (!el) return null;

  map = L.map(el, {
    zoomControl: false,
    attributionControl: true,
    zoomAnimation: false,
    fadeAnimation: true,
    markerZoomAnimation: false,
    // Minder gevoelige scroll/pinch-zoom
    zoomSnap: 0.25,
    zoomDelta: 0.5,
    wheelPxPerZoomLevel: 160,
    wheelDebounceTime: 45,
  });
  L.control.zoom({ position: 'bottomleft' }).addTo(map);

  L.tileLayer('https://service.pdok.nl/brt/achtergrondkaart/wmts/v2_0/grijs/EPSG:3857/{z}/{x}/{y}.png', {
    attribution: 'Kaart © <a href="https://www.pdok.nl">PDOK/Kadaster</a>',
    maxZoom: 19,
    updateWhenZooming: false,
    keepBuffer: 2,
  }).addTo(map);

  poiLaag = L.layerGroup().addTo(map);

  klaar = true;
  toonNlOverzicht(false);
  window.addEventListener('resize', () => {
    if (!$stageOpen()) return;
    toonNlOverzicht(false);
  });
  return map;
}

function mapEl() {
  return document.getElementById('map');
}

function wisPoi() {
  poiLaag?.clearLayers();
}

/** Zachte overgang: kaart vervaagt → springt naar view → komt terug. */
function metOvergang(doeSprong, { duur = 220 } = {}) {
  const el = mapEl();
  if (!el) {
    doeSprong();
    return;
  }

  clearTimeout(overgangTimer);
  el.classList.add('map-overgang');

  overgangTimer = setTimeout(() => {
    doeSprong();
    requestAnimationFrame(() => {
      overgangTimer = setTimeout(() => {
        el.classList.remove('map-overgang');
      }, 80);
    });
  }, duur);
}

/** Centreer NL in het zichtbare kaartdeel (rechts op desktop, boven op mobiel). */
export function toonNlOverzicht(animate = false) {
  const m = initMap();
  if (!m) return;

  const breed = window.innerWidth;
  const hoog = window.innerHeight;
  const mobiel = breed <= 900;
  const zoom = mobiel ? 7.3 : NL_ZOOM;

  const plaats = () => {
    m.setView(NL_CENTER, zoom, { animate: false });
    if (mobiel) {
      m.panBy([0, Math.round(hoog * 0.14)], { animate: false });
    } else {
      m.panBy([-Math.round(breed * 0.14), Math.round(hoog * 0.04)], { animate: false });
    }
  };

  if (animate) metOvergang(plaats);
  else plaats();
}

function $stageOpen() {
  const stage = document.getElementById('stage');
  return stage && !stage.classList.contains('weg');
}

function plaatsMarker(m, lat, lon) {
  if (marker) marker.remove();
  marker = L.circleMarker([lat, lon], {
    radius: 11,
    color: MARKER_COLOR,
    weight: 2.5,
    fillColor: MARKER_FILL,
    fillOpacity: .45,
    className: 'locatie-marker',
  }).addTo(m);

  let r = 2;
  marker.setRadius(r);
  const tick = () => {
    r += (11 - r) * 0.28;
    if (r > 10.7) {
      marker.setRadius(11);
      return;
    }
    marker.setRadius(r);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function fmtM(m) {
  if (m == null) return '';
  if (m < 1000) return `${m} m`;
  return `${(m / 1000).toLocaleString('nl-NL', { maximumFractionDigits: 1 })} km`;
}

function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * @param {{ naam: string, lat: number, lon: number, afstandM?: number, soort?: string }[]} halten
 */
export function toonOvOpKaart(halten) {
  const m = initMap();
  if (!m || !poiLaag) return;

  // Verwijder alleen bestaande OV-markers (behoud supermarkt)
  poiLaag.eachLayer(layer => {
    if (layer.options?.pdSoort === 'ov') poiLaag.removeLayer(layer);
  });

  const SOORT = { bus: 'Bus', tram: 'Tram', metro: 'Metro', trein: 'Trein', ov: 'OV' };
  for (const h of halten || []) {
    if (!Number.isFinite(h.lat) || !Number.isFinite(h.lon)) continue;
    const label = SOORT[h.soort] || 'OV';
    const afst = fmtM(h.afstandM);
    const cm = L.circleMarker([h.lat, h.lon], {
      radius: 7,
      color: OV_KLEUR,
      weight: 2,
      fillColor: OV_VUL,
      fillOpacity: 0.85,
      pdSoort: 'ov',
      className: 'poi-ov',
    });
    cm.bindTooltip(
      `<strong>${escHtml(h.naam)}</strong><br><span class="poi-meta">${escHtml(label)}${afst ? ` · ${escHtml(afst)}` : ''}</span>`,
      { direction: 'top', offset: [0, -6], opacity: 0.95, className: 'poi-tip' },
    );
    poiLaag.addLayer(cm);
  }
}

/**
 * @param {{ naam: string, lat: number, lon: number, afstandM?: number }[] | null | undefined} lijst
 */
export function toonSupermarktenOpKaart(lijst) {
  const m = initMap();
  if (!m || !poiLaag) return;

  poiLaag.eachLayer(layer => {
    if (layer.options?.pdSoort === 'supermarkt') poiLaag.removeLayer(layer);
  });

  const items = Array.isArray(lijst) ? lijst : [];
  items.forEach((sm, i) => {
    if (!sm || !Number.isFinite(sm.lat) || !Number.isFinite(sm.lon)) return;
    const afst = fmtM(sm.afstandM);
    const dichtst = i === 0;
    const cm = L.circleMarker([sm.lat, sm.lon], {
      radius: dichtst ? 8 : 6,
      color: SM_KLEUR,
      weight: dichtst ? 2.5 : 2,
      fillColor: SM_VUL,
      fillOpacity: dichtst ? 0.95 : 0.75,
      pdSoort: 'supermarkt',
      className: 'poi-sm',
    });
    cm.bindTooltip(
      `<strong>${escHtml(sm.naam)}</strong><br><span class="poi-meta">Supermarkt${afst ? ` · ${escHtml(afst)}` : ''}</span>`,
      { direction: 'top', offset: [0, -6], opacity: 0.95, className: 'poi-tip' },
    );
    poiLaag.addLayer(cm);
  });
}

/** @deprecated gebruik toonSupermarktenOpKaart */
export function toonSupermarktOpKaart(sm) {
  toonSupermarktenOpKaart(sm ? [sm] : []);
}

export function toonLocatie(lat, lon) {
  const m = initMap();
  if (!m || !lat) return;

  wisPoi();
  const doel = window.innerWidth > 640 ? [lat, lon - 0.0022] : [lat + 0.0012, lon];

  metOvergang(() => {
    m.setView(doel, 17, { animate: false });
    plaatsMarker(m, lat, lon);
  }, { duur: 240 });
}

export function resetKaart() {
  if (marker) { marker.remove(); marker = null; }
  wisPoi();
  toonNlOverzicht(true);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initMap);
} else {
  initMap();
}
