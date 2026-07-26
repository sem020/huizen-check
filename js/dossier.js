import { LS, $ } from './config.js';
import { splitsNaam, parsePoint } from './utils.js';
import { toonLocatie, resetKaart } from './map.js';
import { laadBag } from './bag.js';
import { laadWoz } from './woz.js';
import { laadEnergielabel } from './energielabel.js';
import { laadMonumenten } from './monumenten.js';
import { laadCbs } from './cbs.js';
import { laadNabijheid } from './nabijheid.js';
import { laadOv } from './ov.js';
import { resetDossierState, dossierState } from './state.js';
import { applyPendingUnlock, updatePremiumUi } from './premium.js';

export async function toonDossier(doc) {
  if (!doc?.weergavenaam) throw new Error('ongeldig adres');

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
  if ($('el-status')) {
    $('el-status').textContent = 'Energielabel ophalen…';
    $('el-status').className = 'status';
  }
  if ($('el-inhoud')) $('el-inhoud').style.display = 'none';
  if ($('mon-status')) {
    $('mon-status').textContent = 'Monumentenstatus ophalen…';
    $('mon-status').className = 'status';
  }
  if ($('mon-inhoud')) $('mon-inhoud').style.display = 'none';
  if ($('cbs-status')) {
    $('cbs-status').textContent = 'Buurtcijfers ophalen…';
    $('cbs-status').className = 'status';
  }
  if ($('cbs-inhoud')) $('cbs-inhoud').style.display = 'none';
  if ($('nabij-status')) {
    $('nabij-status').textContent = 'Nabijheid ophalen…';
    $('nabij-status').className = 'status';
  }
  if ($('nabij-inhoud')) $('nabij-inhoud').style.display = 'none';
  if ($('ov-status')) {
    $('ov-status').textContent = 'OV-halten ophalen…';
    $('ov-status').className = 'status';
  }
  if ($('ov-inhoud')) $('ov-inhoud').style.display = 'none';

  const [lon, lat] = parsePoint(doc.centroide_ll);
  toonLocatie(lat, lon);
  laadBag(doc);
  laadWoz(doc);
  laadEnergielabel(doc);
  laadMonumenten(lat, lon);
  laadCbs(doc);
  laadNabijheid(doc, lat, lon);
  laadOv(lat, lon);

  applyPendingUnlock();
  updatePremiumUi();
}

export async function openDossier(lookupId) {
  const r = await fetch(`${LS}/lookup?id=${encodeURIComponent(lookupId)}&fl=*`);
  const doc = (await r.json()).response?.docs?.[0];
  if (doc) await toonDossier(doc);
}

export function sluitDossier(input) {
  $('dossier').classList.remove('open');
  $('stage').classList.remove('weg');
  resetKaart();
  resetDossierState();
  updatePremiumUi();
  input.focus();
  input.select();
}
