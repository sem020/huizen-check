import { test, before } from 'node:test';
import assert from 'node:assert/strict';

const elements = new Map();

function makeEl(id) {
  const el = {
    id,
    textContent: '',
    className: '',
    innerHTML: '',
    style: {},
    querySelector() {
      return null;
    },
  };
  elements.set(id, el);
  return el;
}

before(() => {
  for (const id of ['ov-status', 'ov-inhoud', 'ov-lijst', 'nabij-status', 'nabij-inhoud', 'nabij-grid', 'nabij-naam', 'map']) {
    makeEl(id);
  }
  global.document = {
    getElementById(id) {
      return elements.get(id) || null;
    },
  };
  global.L = undefined;
});

test('het dossier toont OV als niet beschikbaar in plaats van als een fout', async () => {
  global.fetch = async (url) => {
    assert.match(String(url), /\/api\/ov-dichtbij/);
    return {
      ok: true,
      status: 200,
      json: async () => ({ halten: [], beschikbaar: false }),
    };
  };
  const { laadOv } = await import('../js/ov.js');
  const { dossierState } = await import('../js/state.js');
  await laadOv(52.37, 4.89, dossierState.generatie);
  const status = elements.get('ov-status');
  assert.match(status.innerHTML, /tijdelijk niet beschikbaar/);
  assert.equal(status.className, 'status f');
  assert.equal(elements.get('ov-inhoud').style.display, 'none');
  assert.equal(dossierState.ov.beschikbaar, false);
});

test('een lege OV-lijst blijft "geen halte", niet "niet beschikbaar"', async () => {
  global.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ halten: [], beschikbaar: true }),
  });
  const { laadOv } = await import('../js/ov.js');
  const { dossierState } = await import('../js/state.js');
  elements.get('ov-status').innerHTML = '';
  await laadOv(52.37, 4.89, dossierState.generatie);
  assert.match(elements.get('ov-status').textContent, /Geen OV-halte/);
});

test('supermarkt-uitval laat de nabijheidsectie staan', async () => {
  global.fetch = async (url) => {
    const u = String(url);
    if (u.includes('supermarkt-dichtbij')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ supermarket: null, supermarkets: [], beschikbaar: false }),
      };
    }
    if (u.includes('cbs-nabijheid')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          nabijheid: {
            buurt: 'Burgwallen',
            gemeente: 'Amsterdam',
            afstanden: { huisarts: 0.4, basisschool: 0.5 },
          },
        }),
      };
    }
    throw new Error('onverwachte fetch ' + u);
  };
  const { laadNabijheid } = await import('../js/nabijheid.js');
  const { dossierState } = await import('../js/state.js');
  await laadNabijheid(
    { buurtnaam: 'Burgwallen', gemeentenaam: 'Amsterdam' },
    52.37,
    4.89,
    dossierState.generatie,
  );
  assert.equal(elements.get('nabij-inhoud').style.display, 'block');
  assert.match(elements.get('nabij-grid').innerHTML, /tijdelijk niet beschikbaar/);
  assert.match(elements.get('nabij-grid').innerHTML, /Huisarts/);
  assert.equal(dossierState.nabijheid.supermarket, null);
});
