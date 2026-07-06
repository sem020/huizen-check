import { LS, $ } from './config.js';
import { splitsNaam, parsePoint } from './utils.js';
import { toonLocatie, resetKaart } from './map.js';
import { laadBag } from './bag.js';
import { laadWoz } from './woz.js';
import { vulBronnen } from './bronnen.js';
import { resetDossierState, dossierState } from './state.js';
import { updatePremiumUi, applyPendingUnlock } from './premium.js';

export function toonDossier(doc) {
  resetDossierState();
  dossierState.doc = doc;

  $('stage').classList.add('weg');
  $('dossier').classList.add('open');

  const [straat, rest] = splitsNaam(doc.weergavenaam);
  dossierState.adres = straat;
  dossierState.plaats = rest || doc.woonplaatsnaam || '';
  $('d-adres').textContent = dossierState.adres;
  $('d-plaats').textContent = dossierState.plaats;

  ['s-bouwjaar', 's-opp', 's-woz'].forEach(id => { $(id).classList.add('skelet'); $(id).textContent = '0000'; });
  $('chips').innerHTML = '';
  $('woz-status').textContent = 'Waarden ophalen…';
  $('woz-status').className = 'status';
  $('woz-inhoud').style.display = 'none';

  const [lon, lat] = parsePoint(doc.centroide_ll);
  toonLocatie(lat, lon);
  vulBronnen(doc, lat, lon);
  laadBag(doc);
  laadWoz(doc);

  applyPendingUnlock();
  updatePremiumUi();
}

export async function openDossier(lookupId) {
  const r = await fetch(`${LS}/lookup?id=${encodeURIComponent(lookupId)}&fl=*`);
  const doc = (await r.json()).response?.docs?.[0];
  if (doc) toonDossier(doc);
}

export function sluitDossier(input) {
  $('dossier').classList.remove('open');
  $('stage').classList.remove('weg');
  resetKaart();
  resetDossierState();
  input.focus();
  input.select();
}
