import { $ } from './config.js';
import { dossierState } from './state.js';

const DEFAULT_TITLE = 'Pandloket — open data over elk Nederlands adres';
const DEFAULT_DESC =
  'Zoek een adres en zie gratis bouwjaar, woonoppervlak, WOZ-waarde, energielabel, buurtcijfers en meer uit officiële open bronnen.';

/** SEO-vriendelijke slug uit weergavenaam. */
export function slugifyAdres(weergavenaam) {
  return String(weergavenaam || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);
}

export function unslugAdres(slug) {
  return decodeURIComponent(String(slug || ''))
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Deelbare URL: /pand/straat-huisnummer-plaats?id=… */
export function shareUrlVoorDoc(doc) {
  const origin = location.origin;
  const slug = slugifyAdres(doc?.weergavenaam);
  const url = new URL(slug ? `${origin}/pand/${slug}` : `${origin}/`);
  if (doc?.id) url.searchParams.set('id', doc.id);
  return url.toString();
}

function ensureMeta(attr, key, content) {
  let el = document.querySelector(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function setCanonical(href) {
  let link = document.querySelector('link[rel="canonical"]');
  if (!link) {
    link = document.createElement('link');
    link.setAttribute('rel', 'canonical');
    document.head.appendChild(link);
  }
  link.setAttribute('href', href);
}

function updatePageMeta({ title, description, url }) {
  document.title = title;
  ensureMeta('name', 'description', description);
  ensureMeta('property', 'og:title', title);
  ensureMeta('property', 'og:description', description);
  ensureMeta('property', 'og:url', url);
  ensureMeta('name', 'twitter:title', title);
  ensureMeta('name', 'twitter:description', description);
  setCanonical(url);
}

/** Zet pretty URL + meta bij open dossier. */
export function zetShareUrl(doc) {
  if (!doc?.weergavenaam && !doc?.id) return;
  const next = shareUrlVoorDoc(doc);
  const path = new URL(next).pathname + new URL(next).search;
  if (location.pathname + location.search !== path) {
    history.replaceState({ pandloket: true, id: doc.id || null }, '', path);
  }
  const kort = (doc.weergavenaam || '').split(',')[0].trim() || 'Adres';
  updatePageMeta({
    title: `${kort} — Pandloket`,
    description: `Openbare gegevens over ${doc.weergavenaam}: bouwjaar, WOZ-waarde, energielabel, buurtcijfers en meer.`,
    url: next.split('#')[0],
  });
}

export function wisShareUrl() {
  history.replaceState({}, '', '/');
  updatePageMeta({
    title: DEFAULT_TITLE,
    description: DEFAULT_DESC,
    url: `${location.origin}/`,
  });
}

export async function deelHuidigAdres() {
  const doc = dossierState.doc;
  if (!doc) return;

  const url = shareUrlVoorDoc(doc);
  const titel = doc.weergavenaam || 'Pandloket';
  const tekst = `Bekijk openbare pandgegevens op Pandloket: ${titel}`;

  try {
    if (navigator.share) {
      await navigator.share({ title: `${titel} — Pandloket`, text: tekst, url });
      return;
    }
  } catch (e) {
    if (e?.name === 'AbortError') return;
  }

  try {
    await navigator.clipboard.writeText(url);
    flashDeel('Link gekopieerd');
  } catch {
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

/** Lees id/q/slug uit URL (/, /?id=, /pand/slug). */
export function leesShareParams() {
  const params = new URLSearchParams(location.search);
  const m = location.pathname.match(/^\/pand\/([^/]+)\/?$/);
  return {
    id: params.get('id') || '',
    q: params.get('q') || '',
    slug: m ? decodeURIComponent(m[1]) : '',
  };
}
