/** API-endpoints en gedeelde constanten */
export const LS  = 'https://api.pdok.nl/bzk/locatieserver/search/v3_1';
export const WFS = 'https://service.pdok.nl/lv/bag/wfs/v2_0';
export const WOZ = 'https://api.kadaster.nl/lvwoz/wozwaardeloket-api/v1';

export const NL_CENTER = [52.12, 5.29];
export const NL_ZOOM = 7.6;
export const MARKER_COLOR = '#0D9488';
export const MARKER_FILL = '#14B8A6';

/** Premium PDF — zet previewMode op false wanneer betaling live is. */
export const PREMIUM = {
  price: '4,95',
  previewMode: true,
  paymentUrl: '',
  productName: 'Panddossier PDF',
};

export const $ = id => document.getElementById(id);
