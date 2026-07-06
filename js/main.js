import { $ } from './config.js';
import { initSearch } from './search.js';
import { sluitDossier } from './dossier.js';
import { initPremium } from './premium.js';
import './map.js';

const { input } = initSearch();
initPremium();

$('sluit').addEventListener('click', () => sluitDossier(input));
$('herzoek').addEventListener('click', () => sluitDossier(input));
