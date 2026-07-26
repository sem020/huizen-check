/** API-endpoints en gedeelde constanten */
export const LS  = 'https://api.pdok.nl/bzk/locatieserver/search/v3_1';
export const WFS = 'https://service.pdok.nl/lv/bag/wfs/v2_0';
/** @deprecated WOZ loopt via /api/woz (server-proxy); directe URL alleen als referentie */
export const WOZ = 'https://api.kadaster.nl/lvwoz/wozwaardeloket-api/v1';

export const NL_CENTER = [52.12, 5.29];
export const NL_ZOOM = 7.6;
export const MARKER_COLOR = '#0D9488';
export const MARKER_FILL = '#14B8A6';

/**
 * Premium PDF
 * - enabled false = verborgen (gratis launch, knop later weer aan)
 * - previewMode true  = gratis download (alleen UI-test, geen checkout)
 * - previewMode false = checkout via server (mock / Mollie test / live)
 * API_BASE: leeg = zelfde origin (npm start). Anders bv. http://localhost:3000
 */
export const PREMIUM = {
  enabled: false,
  price: '4,95',
  previewMode: false,
  apiBase: '',
  productName: 'Pandloket PDF',
};

export const $ = id => document.getElementById(id);

export function apiUrl(path) {
  const base = (PREMIUM.apiBase || '').replace(/\/$/, '');
  return base + path;
}
