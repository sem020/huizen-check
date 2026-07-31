import { $ } from './config.js';
import { initSearch, openVanShareUrl } from './search.js';
import { sluitDossier } from './dossier.js';
import { initPremium } from './premium.js';
import { deelHuidigAdres } from './share.js';
import { initThema } from './theme.js';
import './map.js';

initThema();

const { input, melding } = initSearch();
initPremium();

function sluit() {
  sluitDossier(input);
}

$('sluit').addEventListener('click', sluit);
$('herzoek').addEventListener('click', sluit);

document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  const dossier = $('dossier');
  if (!dossier?.classList.contains('open')) return;
  // Laat suggestielijst eerst Escape afhandelen
  if ($('sug')?.style.display === 'block') return;
  const modal = $('premium-modal');
  if (modal && !modal.hidden) return;
  e.preventDefault();
  sluit();
});

const deelBtn = $('deel');
if (deelBtn) {
  deelBtn.addEventListener('click', () => {
    deelHuidigAdres().catch(err => console.warn('Delen mislukt:', err));
  });
}

openVanShareUrl(melding);
