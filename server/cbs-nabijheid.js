/** CBS Nabijheidsstatistieken — gemiddelde afstanden tot voorzieningen per buurt/wijk. */
const CBS_TABLE = '86270NED';
const CBS_FALLBACK = '86134NED';
const CBS_BASE = id => `https://opendata.cbs.nl/ODataApi/odata/${id}`;

function padGemeente(code) {
  const c = String(code || '').replace(/\D/g, '');
  return c ? `GM${c.padStart(4, '0')}` : '';
}

function escOData(s) {
  return String(s).replace(/'/g, "''");
}

function num(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** CBS keys are often space-padded to 10 chars. */
function padKey(key) {
  const k = String(key || '').trim();
  return k ? k.padEnd(10, ' ') : '';
}

async function resolveGebied(tableId, { buurtnaam, gemeentecode }) {
  const base = CBS_BASE(tableId);
  const gm = padGemeente(gemeentecode);
  let match = null;

  async function first(filter) {
    const url = `${base}/WijkenEnBuurten?$filter=${filter}&$top=10`;
    const r = await fetch(url);
    if (!r.ok) return null;
    const d = await r.json();
    const rows = d.value || [];
    if (!rows.length) return null;
    if (gm) {
      const m = rows.find(x => String(x.Municipality || '').trim() === gm);
      if (m) return m;
    }
    // Prefer buurt (BU) over wijk (WK) over gemeente (GM)
    const bu = rows.find(x => String(x.Key || '').trim().startsWith('BU'));
    return bu || rows[0];
  }

  match = await first(`Title eq '${escOData(buurtnaam)}'${gm ? ` and Municipality eq '${gm}'` : ''}`);
  if (!match) match = await first(`Title eq '${escOData(buurtnaam)}'`);
  if (!match) {
    const kort = buurtnaam.replace(/\s*e\.o\.\s*$/i, '').trim();
    match = await first(`substringof('${escOData(kort)}',Title)`);
  }
  return match;
}

const SELECT = [
  'WijkenEnBuurten',
  'Gemeentenaam_1',
  'AfstandTotHuisartsenpraktijk_5',
  'AfstandTotGroteSupermarkt_24',
  'AfstandTotKinderdagverblijf_52',
  'AfstandTotSchool_60',
  'AfstandTotSchool_64',
  'AfstandTotBibliotheek_92',
  'AfstandTotTreinstationsTotaal_90',
  'AfstandTotParkOfPlantsoen_77',
  'AfstandTotApotheek_10',
].join(',');

function mapRow(row, titel, tableId) {
  return {
    buurt: titel,
    gemeente: String(row.Gemeentenaam_1 || '').trim(),
    cbsCode: String(row.WijkenEnBuurten || '').trim(),
    jaar: tableId === '86270NED' ? 2025 : 2024,
    afstanden: {
      huisarts: num(row.AfstandTotHuisartsenpraktijk_5),
      supermarkt: num(row.AfstandTotGroteSupermarkt_24),
      kinderopvang: num(row.AfstandTotKinderdagverblijf_52),
      basisschool: num(row.AfstandTotSchool_60),
      voortgezet: num(row.AfstandTotSchool_64),
      bibliotheek: num(row.AfstandTotBibliotheek_92),
      treinstation: num(row.AfstandTotTreinstationsTotaal_90),
      park: num(row.AfstandTotParkOfPlantsoen_77),
      apotheek: num(row.AfstandTotApotheek_10),
    },
    bron: 'CBS Nabijheidsstatistieken',
    tabel: tableId,
  };
}

async function fetchNabijheid(tableId, key, titel) {
  const padded = padKey(key);
  const url = `${CBS_BASE(tableId)}/TypedDataSet?$filter=WijkenEnBuurten eq '${escOData(padded)}'&$select=${SELECT}&$top=1`;
  const r = await fetch(url);
  if (!r.ok) {
    const err = new Error(`CBS nabijheid ${r.status}`);
    err.status = r.status;
    throw err;
  }
  const d = await r.json();
  const row = d.value?.[0];
  if (!row) return null;
  return mapRow(row, titel, tableId);
}

/**
 * Gemiddelde reisafstanden tot voorzieningen voor de buurt/wijk van het adres.
 */
export async function nabijheidCijfers({ buurtnaam, gemeentecode, gemeentenaam }) {
  if (!buurtnaam) {
    const err = new Error('buurtnaam verplicht');
    err.status = 400;
    throw err;
  }

  for (const tableId of [CBS_TABLE, CBS_FALLBACK]) {
    const gebied = await resolveGebied(tableId, { buurtnaam, gemeentecode });
    if (!gebied) continue;
    const data = await fetchNabijheid(tableId, gebied.Key, gebied.Title);
    if (data) {
      if (gemeentenaam && !data.gemeente) data.gemeente = gemeentenaam;
      return data;
    }
  }
  return null;
}
