/** Huidige dossiergegevens voor PDF-export en premium-flow. */
export const dossierState = {
  /** Verhoogt bij elk nieuw dossier — voorkomt race bij snelle zoekopdrachten. */
  generatie: 0,
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
  energielabel: null,
  monumenten: null,
  cbs: null,
  nabijheid: null,
  ov: null,
  klaar: { bag: false, woz: false },
};

export function resetDossierState() {
  dossierState.generatie += 1;
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
  dossierState.energielabel = null;
  dossierState.monumenten = null;
  dossierState.cbs = null;
  dossierState.nabijheid = null;
  dossierState.ov = null;
  dossierState.klaar = { bag: false, woz: false };
}

/** True zolang dit de actieve dossier-generatie is. */
export function isActieveGeneratie(gen) {
  return gen === dossierState.generatie;
}

export function isDossierGeladen() {
  return !!dossierState.adres;
}

export function adresSleutel() {
  const s = `${dossierState.adres}|${dossierState.plaats}`.toLowerCase().trim();
  return s.replace(/[^a-z0-9|]/g, '');
}
