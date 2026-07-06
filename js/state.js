/** Huidige dossiergegevens voor PDF-export en premium-flow. */
export const dossierState = {
  doc: null,
  adres: '',
  plaats: '',
  bouwjaar: '—',
  oppervlak: '—',
  wozKort: '—',
  wozBedrag: '—',
  wozDelta: '',
  chips: [],
  wozRijen: [],
  bronnen: [],
  klaar: { bag: false, woz: false },
};

export function resetDossierState() {
  dossierState.doc = null;
  dossierState.adres = '';
  dossierState.plaats = '';
  dossierState.bouwjaar = '—';
  dossierState.oppervlak = '—';
  dossierState.wozKort = '—';
  dossierState.wozBedrag = '—';
  dossierState.wozDelta = '';
  dossierState.chips = [];
  dossierState.wozRijen = [];
  dossierState.bronnen = [];
  dossierState.klaar = { bag: false, woz: false };
}

export function isDossierGeladen() {
  return dossierState.klaar.bag || dossierState.klaar.woz;
}

export function adresSleutel() {
  const s = `${dossierState.adres}|${dossierState.plaats}`.toLowerCase().trim();
  return s.replace(/[^a-z0-9|]/g, '');
}
