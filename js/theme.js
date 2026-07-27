const KEY = 'pandloket_theme';

function systeemThema() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function huidigThema() {
  const opgeslagen = localStorage.getItem(KEY);
  if (opgeslagen === 'dark' || opgeslagen === 'light') return opgeslagen;
  return systeemThema();
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

  // Volg systeem alleen als gebruiker nog geen keuze heeft opgeslagen
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (localStorage.getItem(KEY) !== 'dark' && localStorage.getItem(KEY) !== 'light') {
      zetThema(systeemThema());
    }
  });
}
