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
  const hint = $('pdf-hint');
  if (!btn) return;

  const geladen = isDossierGeladen();
  btn.disabled = !geladen;

  if (PREMIUM.previewMode) {
    btn.textContent = 'Download PDF (preview)';
    if (hint) hint.textContent = 'Gratis tijdens preview — later € ' + PREMIUM.price + ' per dossier.';
  } else if (isUnlocked()) {
    btn.textContent = 'Download PDF';
    if (hint) hint.textContent = 'Betaald voor dit adres — download onbeperkt.';
  } else {
    btn.textContent = 'Bestel PDF — € ' + PREMIUM.price;
    if (hint) hint.textContent = 'Eenmalig per adres · direct downloaden na betaling.';
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

function downloadPdf() {
  if (!isDossierGeladen()) return;
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

  $('pdf-koop')?.addEventListener('click', downloadPdf);
  $('premium-sluit')?.addEventListener('click', sluitModal);
  $('premium-modal')?.addEventListener('click', e => {
    if (e.target === $('premium-modal')) sluitModal();
  });
  $('premium-betaal')?.addEventListener('click', () => {
    if (PREMIUM.previewMode) {
      genereerPdf();
      sluitModal();
      return;
    }
    if (isUnlocked()) {
      genereerPdf();
      sluitModal();
      return;
    }
    startBetaling();
  });

  updatePremiumUi();
}

/** Na succesvolle betaling (redirect) of handmatige unlock. */
export function markeerBetaald() {
  unlockHuidigAdres();
  updatePremiumUi();
  genereerPdf();
}
