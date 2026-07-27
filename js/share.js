import { $ } from './config.js';
import { dossierState } from './state.js';

/** Bouw een deelbare URL voor dit PDOK-adresdocument. */
export function shareUrlVoorDoc(doc) {
  const url = new URL(location.href);
  url.searchParams.delete('unlock');
  url.searchParams.delete('betaald');
  url.searchParams.delete('q');
  if (doc?.id) {
    url.searchParams.set('id', doc.id);
  } else if (doc?.weergavenaam) {
    url.searchParams.set('q', doc.weergavenaam);
  }
  url.hash = '';
  return url.toString();
}

/** Zet ?id= in de adresbalk zonder reload. */
export function zetShareUrl(doc) {
  if (!doc?.id && !doc?.weergavenaam) return;
  const next = shareUrlVoorDoc(doc);
  if (next !== location.href) {
    history.replaceState({ pandloket: true, id: doc.id || null }, '', next);
  }
  if (doc.weergavenaam) {
    document.title = `${doc.weergavenaam.split(',')[0]} — Pandloket`;
  }
}

export function wisShareUrl() {
  const url = new URL(location.href);
  url.searchParams.delete('id');
  url.searchParams.delete('q');
  const qs = url.searchParams.toString();
  history.replaceState({}, '', url.pathname + (qs ? '?' + qs : '') + url.hash);
  document.title = 'Pandloket — alle open data over één adres';
}

export async function deelHuidigAdres() {
  const doc = dossierState.doc;
  if (!doc) return;

  const url = shareUrlVoorDoc(doc);
  const titel = doc.weergavenaam || 'Pandloket';
  const tekst = `Bekijk dit pand op Pandloket: ${titel}`;

  try {
    if (navigator.share) {
      await navigator.share({ title: 'Pandloket', text: tekst, url });
      return;
    }
  } catch (e) {
    if (e?.name === 'AbortError') return;
  }

  try {
    await navigator.clipboard.writeText(url);
    flashDeel('Link gekopieerd');
  } catch {
    // Fallback prompt
    window.prompt('Kopieer deze link:', url);
  }
}

function flashDeel(msg) {
  const btn = $('deel');
  if (!btn) return;
  const prev = btn.getAttribute('data-label') || btn.textContent;
  btn.setAttribute('data-label', prev);
  btn.textContent = msg;
  btn.classList.add('deel-ok');
  clearTimeout(btn._deelTimer);
  btn._deelTimer = setTimeout(() => {
    btn.textContent = btn.getAttribute('data-label') || 'Deel';
    btn.classList.remove('deel-ok');
  }, 1800);
}

/** Lees ?id= of ?q= bij paginalaad. */
export function leesShareParams() {
  const params = new URLSearchParams(location.search);
  return {
    id: params.get('id') || '',
    q: params.get('q') || '',
  };
}
