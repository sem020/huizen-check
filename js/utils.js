export const fmtEur = n => '€ ' + n.toLocaleString('nl-NL');

export function splitsNaam(naam) {
  const i = naam.indexOf(',');
  return i > -1 ? [naam.slice(0, i), naam.slice(i + 1).trim()] : [naam, ''];
}

export function parsePoint(wkt) {
  const m = /POINT\(([\d.\-]+) ([\d.\-]+)\)/.exec(wkt || '');
  return m ? [parseFloat(m[1]), parseFloat(m[2])] : [null, null];
}

export function padBag(id) {
  const s = String(id || '').replace(/\D/g, '');
  return s ? s.padStart(16, '0') : '';
}

export function padNa(id) {
  const s = String(id || '').replace(/\D/g, '');
  return s ? s.padStart(16, '0') : '';
}
