/** CBS Kerncijfers wijken en buurten 2024 (open data). */
const CBS_TABLE = '85984NED';
const CBS_JAAR = 2024;
const CBS_BASE = `https://opendata.cbs.nl/ODataApi/odata/${CBS_TABLE}`;

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

/** CBS gebiedscodes zijn vaak rechts aangevuld met spaties (10 tekens). */
function padKey(key) {
  const k = String(key || '').trim();
  return k ? k.padEnd(10, ' ') : '';
}

function kiesBuurt(rows, gm) {
  const list = rows || [];
  if (!list.length) return null;
  const inGm = gm
    ? list.filter(x => String(x.Municipality || '').trim() === gm)
    : list;
  const pool = inGm.length ? inGm : list;
  const bu = pool.find(x => String(x.Key || '').trim().startsWith('BU'));
  return bu || pool[0];
}

/**
 * Haal CBS-buurtcijfers op via buurtnaam + gemeentecode (Locatieserver-codes
 * komen niet 1-op-1 overeen met CBS-keys).
 */
async function buurtCijfers({ buurtnaam, gemeentecode, gemeentenaam }) {
  if (!buurtnaam) {
    const err = new Error('buurtnaam verplicht');
    err.status = 400;
    throw err;
  }

  const gm = padGemeente(gemeentecode);
  let key = null;
  let titel = buurtnaam;

  // 1) Exacte titel + gemeente
  if (gm) {
    const q1 = `${CBS_BASE}/WijkenEnBuurten?$filter=Title eq '${escOData(buurtnaam)}' and Municipality eq '${gm}'&$top=5`;
    const r1 = await fetch(q1);
    if (r1.ok) {
      const d1 = await r1.json();
      const match = kiesBuurt(d1.value, gm);
      if (match) {
        key = match.Key;
        titel = match.Title;
      }
    }
  }

  // 2) Alleen titel
  if (!key) {
    const q2 = `${CBS_BASE}/WijkenEnBuurten?$filter=Title eq '${escOData(buurtnaam)}'&$top=10`;
    const r2 = await fetch(q2);
    if (r2.ok) {
      const d2 = await r2.json();
      const match = kiesBuurt(d2.value, gm);
      if (match) {
        key = match.Key;
        titel = match.Title;
      }
    }
  }

  // 3) substring fallback
  if (!key) {
    const kort = buurtnaam.replace(/\s*e\.o\.\s*$/i, '').trim();
    const q3 = `${CBS_BASE}/WijkenEnBuurten?$filter=substringof('${escOData(kort)}',Title)&$top=15`;
    const r3 = await fetch(q3);
    if (r3.ok) {
      const d3 = await r3.json();
      const rows = (d3.value || []).filter(x => {
        const k = String(x.Key || '').trim();
        return k.startsWith('BU') || k.startsWith('WK');
      });
      const match = kiesBuurt(rows, gm);
      if (match) {
        key = match.Key;
        titel = match.Title;
      }
    }
  }

  if (!key) return null;

  const select = [
    'WijkenEnBuurten',
    'Gemeentenaam_1',
    'AantalInwoners_5',
    'HuishoudensTotaal_29',
    'Bevolkingsdichtheid_34',
    'Woningvoorraad_35',
    'GemiddeldeWOZWaardeVanWoningen_39',
    'Koopwoningen_47',
    'HuurwoningenTotaal_48',
    'PercentageEengezinswoning_40',
    'PercentageMeergezinswoning_45',
  ].join(',');

  const padded = padKey(key);
  const dataUrl = `${CBS_BASE}/TypedDataSet?$filter=WijkenEnBuurten eq '${escOData(padded)}'&$select=${select}&$top=1`;
  const rd = await fetch(dataUrl);
  if (!rd.ok) {
    const err = new Error(`CBS data ${rd.status}`);
    err.status = rd.status;
    throw err;
  }
  const dd = await rd.json();
  const row = dd.value?.[0];
  if (!row) return null;

  const wozK = num(row.GemiddeldeWOZWaardeVanWoningen_39);

  return {
    buurt: titel,
    gemeente: String(row.Gemeentenaam_1 || gemeentenaam || '').trim(),
    cbsCode: String(key).trim(),
    jaar: CBS_JAAR,
    inwoners: num(row.AantalInwoners_5),
    huishoudens: num(row.HuishoudensTotaal_29),
    dichtheid: num(row.Bevolkingsdichtheid_34),
    woningen: num(row.Woningvoorraad_35),
    /** Gemiddelde WOZ in euro (CBS levert × €1.000). */
    gemWoz: wozK != null ? wozK * 1000 : null,
    pctKoop: num(row.Koopwoningen_47),
    pctHuur: num(row.HuurwoningenTotaal_48),
    pctEengezins: num(row.PercentageEengezinswoning_40),
    pctMeergezins: num(row.PercentageMeergezinswoning_45),
    bron: `CBS Kerncijfers wijken en buurten ${CBS_JAAR}`,
    bronUrl: `https://www.cbs.nl/nl-nl/cijfers/detail/${CBS_TABLE}`,
  };
}

exports.buurtCijfers = buurtCijfers;
exports.CBS_JAAR = CBS_JAAR;
