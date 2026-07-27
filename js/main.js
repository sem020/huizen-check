import { $ } from './config.js';
import { initSearch, openVanShareUrl } from './search.js';
import { sluitDossier } from './dossier.js';
import { initPremium } from './premium.js';
import { deelHuidigAdres } from './share.js';
import './map.js';

const { input, melding } = initSearch();
initPremium();

$('sluit').addEventListener('click', () => sluitDossier(input));
$('herzoek').addEventListener('click', () => sluitDossier(input));

const deelBtn = $('deel');
if (deelBtn) {
  deelBtn.addEventListener('click', () => {
    deelHuidigAdres().catch(err => console.warn('Delen mislukt:', err));
  });
}

// Deep link: /?id=… of /?q=…
openVanShareUrl(melding);
