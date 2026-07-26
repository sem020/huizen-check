import { PREMIUM, $, apiUrl } from './config.js';
import { dossierState, isDossierGeladen, adresSleutel } from './state.js';
import { genereerPdf } from './pdf.js';

const UNLOCK_KEY = 'pandloket_unlock';

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
    sessionStorage.setItem('pandloket_pending_unlock', '1');
    params.delete('unlock');
    params.delete('betaald');
    const qs = params.toString();
    history.replaceState({}, '', location.pathname + (qs ? '?' + qs : ''));
  }
}

export function applyPendingUnlock() {
  if (!sessionStorage.getItem('pandloket_pending_unlock')) return;
  unlockHuidigAdres();
  sessionStorage.removeItem('pandloket_pending_unlock');
  updatePremiumUi();
}

export function updatePremiumUi() {
  if (!PREMIUM.enabled) {
    const blok = $('premium-blok');
    if (blok) blok.hidden = true;
    return;
  }

  const blok = $('premium-blok');
  if (blok) blok.hidden = false;

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
    if (hint) hint.textContent = 'Zet previewMode uit om checkout te testen.';
  } else if (isUnlocked()) {
    if (titel) titel.textContent = 'Download PDF';
    if (sub) sub.textContent = 'Betaald voor dit adres';
    if (hint) hint.textContent = 'Onbeperkt opnieuw downloaden op dit apparaat.';
  } else {
    if (titel) titel.textContent = 'Bestel PDF — € ' + PREMIUM.price;
    if (sub) sub.textContent = 'Betalen · PDF per e-mail + download';
    if (hint) hint.textContent = 'Eenmalig per adres · mock of Mollie-test.';
  }
}

function openModal() {
  $('premium-modal').classList.add('open');
  $('premium-adres').textContent = dossierState.adres + (dossierState.plaats ? ', ' + dossierState.plaats : '');
  const email = $('premium-email');
  if (email && !email.value) email.focus();
}

function sluitModal() {
  $('premium-modal').classList.remove('open');
}

function dossierPayload() {
  return {
    adres: dossierState.adres,
    plaats: dossierState.plaats,
    bouwjaar: dossierState.bouwjaar,
    oppervlak: dossierState.oppervlak,
    wozKort: dossierState.wozKort,
    wozBedrag: dossierState.wozBedrag,
    wozDelta: dossierState.wozDelta,
    chips: dossierState.chips,
    wozRijen: dossierState.wozRijen,
    bronnen: dossierState.bronnen,
    energielabel: dossierState.energielabel,
    monumenten: dossierState.monumenten,
    cbs: dossierState.cbs,
    nabijheid: dossierState.nabijheid,
    ov: dossierState.ov,
  };
}

async function startCheckout() {
  const emailEl = $('premium-email');
  const email = emailEl?.value?.trim() || '';
  const foutEl = $('premium-fout');
  const btn = $('premium-betaal');

  if (foutEl) {
    foutEl.hidden = true;
    foutEl.style.display = 'none';
    foutEl.textContent = '';
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    if (foutEl) {
      foutEl.hidden = false;
      foutEl.style.display = 'block';
      foutEl.textContent = 'Vul een geldig e-mailadres in.';
    }
    emailEl?.focus();
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Bezig…';
  }

  try {
    const r = await fetch(apiUrl('/api/checkout'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, dossier: dossierPayload() }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'Checkout mislukt');

    sessionStorage.setItem('pandloket_last_order', j.orderId);
    location.href = j.checkoutUrl;
  } catch (e) {
    if (foutEl) {
      foutEl.hidden = false;
      foutEl.style.display = 'block';
      foutEl.textContent = e.message + ' — start de server met: npm start';
    } else {
      alert(e.message);
    }
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Betaal & download';
    }
  }
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

  if (!PREMIUM.enabled) {
    const blok = $('premium-blok');
    if (blok) blok.hidden = true;
    const modal = $('premium-modal');
    if (modal) modal.hidden = true;
    return;
  }

  const blok = $('premium-blok');
  if (blok) blok.hidden = false;
  const modal = $('premium-modal');
  if (modal) modal.hidden = false;

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
    startCheckout();
  });

  $('premium-email')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      startCheckout();
    }
  });

  updatePremiumUi();
}

export function markeerBetaald() {
  unlockHuidigAdres();
  updatePremiumUi();
  genereerPdf();
}
