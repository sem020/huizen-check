/** CBS Kerncijfers wijken en buurten (open data). */
const CBS_TABLE = '83765NED';
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

/**
 * Haal CBS-buurtcijfers op via buurtnaam + gemeentecode (Locatieserver-codes
 * komen niet 1-op-1 overeen met CBS-keys).
 */
export async function buurtCijfers({ buurtnaam, gemeentecode, gemeentenaam }) {
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
    const q1 = `${CBS_BASE}/WijkenEnBuurten?$filter=Title eq '${escOData(buurtnaam)}' and Municipality eq '${gm}'&$top=1`;
    const r1 = await fetch(q1);
    if (r1.ok) {
      const d1 = await r1.json();
      if (d1.value?.[0]) {
        key = d1.value[0].Key;
        titel = d1.value[0].Title;
      }
    }
  }

  // 2) Alleen titel
  if (!key) {
    const q2 = `${CBS_BASE}/WijkenEnBuurten?$filter=Title eq '${escOData(buurtnaam)}'&$top=5`;
    const r2 = await fetch(q2);
    if (r2.ok) {
      const d2 = await r2.json();
      const rows = d2.value || [];
      const match = gm
        ? rows.find(x => x.Municipality === gm) || rows[0]
        : rows[0];
      if (match) {
        key = match.Key;
        titel = match.Title;
      }
    }
  }

  // 3) substring fallback
  if (!key) {
    const kort = buurtnaam.replace(/\s*e\.o\.\s*$/i, '').trim();
    const q3 = `${CBS_BASE}/WijkenEnBuurten?$filter=substringof('${escOData(kort)}',Title)&$top=10`;
    const r3 = await fetch(q3);
    if (r3.ok) {
      const d3 = await r3.json();
      const rows = (d3.value || []).filter(x => !String(x.Key).startsWith('WK') && !String(x.Key).startsWith('GM'));
      const match = gm ? rows.find(x => x.Municipality === gm) || rows[0] : rows[0];
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
    'HuishoudensTotaal_28',
    'Bevolkingsdichtheid_33',
    'Woningvoorraad_34',
    'GemiddeldeWOZWaardeVanWoningen_35',
    'Koopwoningen_40',
    'HuurwoningenTotaal_41',
    'PercentageEengezinswoning_36',
    'PercentageMeergezinswoning_37',
  ].join(',');

  const dataUrl = `${CBS_BASE}/TypedDataSet?$filter=WijkenEnBuurten eq '${key}'&$select=${select}&$top=1`;
  const rd = await fetch(dataUrl);
  if (!rd.ok) {
    const err = new Error(`CBS data ${rd.status}`);
    err.status = rd.status;
    throw err;
  }
  const dd = await rd.json();
  const row = dd.value?.[0];
  if (!row) return null;

  const wozK = num(row.GemiddeldeWOZWaardeVanWoningen_35);

  return {
    buurt: titel,
    gemeente: String(row.Gemeentenaam_1 || gemeentenaam || '').trim(),
    cbsCode: key,
    inwoners: num(row.AantalInwoners_5),
    huishoudens: num(row.HuishoudensTotaal_28),
    dichtheid: num(row.Bevolkingsdichtheid_33),
    woningen: num(row.Woningvoorraad_34),
    /** Gemiddelde WOZ in euro (CBS levert × €1.000). */
    gemWoz: wozK != null ? wozK * 1000 : null,
    pctKoop: num(row.Koopwoningen_40),
    pctHuur: num(row.HuurwoningenTotaal_41),
    pctEengezins: num(row.PercentageEengezinswoning_36),
    pctMeergezins: num(row.PercentageMeergezinswoning_37),
    bron: 'CBS Kerncijfers wijken en buurten',
  };
}
