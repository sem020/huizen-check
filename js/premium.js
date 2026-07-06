import { PREMIUM, $ } from './config.js';
import { dossierState, isDossierGeladen, adresSleutel } from './state.js';
import { genereerPdf } from './pdf.js';

const UNLOCK_KEY = 'panddossier_unlock';

function isUnlocked() {
  if (PREMIUM.previewMode) return true;
  const sleutel = adresSleutel();
  if (!sleutel) return false;
  try {
    const data = JSON.parse(localStorage.getItem(UNLOCK_KEY) || '{}');
    return !!data[sleutel];
  } catch {
    return false;
  }
}

function unlockHuidigAdres() {
  const sleutel = adresSleutel();
  if (!sleutel) return;
  try {
    const data = JSON.parse(localStorage.getItem(UNLOCK_KEY) || '{}');
    data[sleutel] = Date.now();
    localStorage.setItem(UNLOCK_KEY, JSON.stringify(data));
  } catch { /* ignore */ }
}

export function checkUnlockParam() {
  const params = new URLSearchParams(location.search);
  if (params.get('unlock') === '1' || params.get('betaald') === '1') {
    sessionStorage.setItem('panddossier_pending_unlock', '1');
    params.delete('unlock');
    params.delete('betaald');
    const qs = params.toString();
    history.replaceState({}, '', location.pathname + (qs ? '?' + qs : ''));
  }
}

export function applyPendingUnlock() {
  if (!sessionStorage.getItem('panddossier_pending_unlock')) return;
  unlockHuidigAdres();
  sessionStorage.removeItem('panddossier_pending_unlock');
  updatePremiumUi();
}

export function updatePremiumUi() {
  const btn = $('pdf-koop');
  const titel = $('pdf-koop-titel');
  const sub = $('pdf-koop-sub');
  const hint = $('pdf-hint');
  if (!btn) return;

  const geladen = isDossierGeladen();
  btn.classList.toggle('is-disabled', !geladen);
  btn.setAttribute('aria-disabled', geladen ? 'false' : 'true');

  if (PREMIUM.previewMode) {
    if (titel) titel.textContent = 'Download PDF';
    if (sub) sub.textContent = 'Gratis tijdens preview';
    if (hint) hint.textContent = 'Later € ' + PREMIUM.price + ' per adres · nu gratis testen.';
  } else if (isUnlocked()) {
    if (titel) titel.textContent = 'Download PDF';
    if (sub) sub.textContent = 'Betaald voor dit adres';
    if (hint) hint.textContent = 'Onbeperkt opnieuw downloaden op dit apparaat.';
  } else {
    if (titel) titel.textContent = 'Bestel PDF — € ' + PREMIUM.price;
    if (sub) sub.textContent = 'Direct downloaden na betaling';
    if (hint) hint.textContent = 'Eenmalig per adres.';
  }
}

function openModal() {
  $('premium-modal').classList.add('open');
  $('premium-adres').textContent = dossierState.adres + (dossierState.plaats ? ', ' + dossierState.plaats : '');
}

function sluitModal() {
  $('premium-modal').classList.remove('open');
}

function startBetaling() {
  if (PREMIUM.paymentUrl) {
    const url = new URL(PREMIUM.paymentUrl);
    url.searchParams.set('redirect', location.origin + location.pathname + '?unlock=1');
    window.open(url.toString(), '_blank');
    sluitModal();
    return;
  }
  alert('Betaling nog niet geconfigureerd. Stel PREMIUM.paymentUrl in config.js in.');
}

export function downloadPdf() {
  if (!isDossierGeladen()) {
    alert('Open eerst een adres om een PDF te downloaden.');
    return;
  }
  if (!PREMIUM.previewMode && !isUnlocked()) {
    openModal();
    return;
  }
  genereerPdf();
}

export function initPremium() {
  checkUnlockParam();

  const prijsEl = document.querySelector('.modal-prijs strong');
  if (prijsEl) prijsEl.textContent = '€ ' + PREMIUM.price;

  $('pdf-koop')?.addEventListener('click', e => {
    if (e.currentTarget.classList.contains('is-disabled')) return;
    e.preventDefault();
    downloadPdf();
  });

  $('premium-sluit')?.addEventListener('click', sluitModal);
  $('premium-modal')?.addEventListener('click', e => {
    if (e.target === $('premium-modal')) sluitModal();
  });
  $('premium-betaal')?.addEventListener('click', () => {
    if (PREMIUM.previewMode || isUnlocked()) {
      genereerPdf();
      sluitModal();
      return;
    }
    startBetaling();
  });

  updatePremiumUi();
}

export function markeerBetaald() {
  unlockHuidigAdres();
  updatePremiumUi();
  genereerPdf();
}
