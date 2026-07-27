const KEY = 'pandloket_theme';

export function huidigThema() {
  const opgeslagen = localStorage.getItem(KEY);
  if (opgeslagen === 'dark' || opgeslagen === 'light') return opgeslagen;
  return 'light';
}

export function zetThema(thema) {
  const t = thema === 'dark' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', t);
  localStorage.setItem(KEY, t);
  const knop = document.getElementById('thema-knop');
  if (knop) {
    knop.setAttribute('aria-label', t === 'dark' ? 'Schakel naar lichte modus' : 'Schakel naar donkere modus');
    knop.setAttribute('title', t === 'dark' ? 'Lichte modus' : 'Donkere modus');
  }
}

export function wisselThema() {
  zetThema(huidigThema() === 'dark' ? 'light' : 'dark');
}

export function initThema() {
  zetThema(huidigThema());
  const knop = document.getElementById('thema-knop');
  if (knop) knop.addEventListener('click', wisselThema);
}
