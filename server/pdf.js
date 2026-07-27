const PDFDocument = require('pdfkit');
const { createWriteStream } = require('fs');
const { pdfPath } = require('./store.js');
const PAGE = { left: 48, right: 48, top: 48, bottom: 52 };
const W = 595.28 - PAGE.left - PAGE.right; // A4 content width
const COLORS = {
  ink: '#0f172a',
  dim: '#475569',
  muted: '#64748b',
  line: '#e2e8f0',
  soft: '#f1f5f9',
  soft2: '#f8fafc',
  accent: '#0d9488',
  accentDark: '#0f766e',
  white: '#ffffff',
  ok: '#059669',
};

function fmtEur(n) {
  if (n == null || Number.isNaN(n)) return '—';
  return '€ ' + Number(n).toLocaleString('nl-NL');
}

function tekst(v, fallback = '—') {
  const s = String(v ?? '').trim();
  return s || fallback;
}

function fmtDatum(iso) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return null;
  }
}

function labelKleur(k) {
  const x = String(k || '').toUpperCase();
  if (x.startsWith('A')) return '#059669';
  if (x === 'B') return '#65a30d';
  if (x === 'C') return '#ca8a04';
  if (x === 'D') return '#ea580c';
  if (x === 'E') return '#dc2626';
  if (x === 'F' || x === 'G') return '#991b1b';
  return '#94a3b8';
}

/**
 * Genereert een PDF-bestand voor een order. Retourneert pad naar bestand.
 */
function genereerPdfBestand(order) {
  const d = order.dossier || {};
  const out = pdfPath(order.id);
  const datum = fmtDatum(order.createdAt || Date.now()) || '';

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      bufferPages: true,
      margins: { top: PAGE.top, bottom: PAGE.bottom, left: PAGE.left, right: PAGE.right },
      info: {
        Title: `Pandloket — ${tekst(d.adres, 'rapport')}`,
        Author: 'Pandloket',
        Subject: 'Woningdossier openbare registers',
      },
    });
    const stream = createWriteStream(out);
    doc.pipe(stream);

    const ensureSpace = (needed = 80) => {
      if (doc.y + needed > doc.page.height - PAGE.bottom) {
        doc.addPage();
        doc.y = PAGE.top;
      }
    };

    const hr = (y = doc.y) => {
      doc.save()
        .strokeColor(COLORS.line).lineWidth(1)
        .moveTo(PAGE.left, y).lineTo(PAGE.left + W, y).stroke()
        .restore();
    };

    const sectionTitle = (title) => {
      ensureSpace(36);
      const y = doc.y;
      doc.save()
        .fillColor(COLORS.accent)
        .rect(PAGE.left, y + 2, 3, 11)
        .fill()
        .restore();
      doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(9)
        .text(title.toUpperCase(), PAGE.left + 10, y, {
          width: W - 10,
          characterSpacing: 1.1,
        });
      doc.y = y + 18;
    };

    const card = (x, y, w, h, draw) => {
      doc.save()
        .roundedRect(x, y, w, h, 10)
        .fill(COLORS.soft)
        .restore();
      draw(x, y, w, h);
    };

    // ===== HEADER =====
    doc.save()
      .rect(0, 0, doc.page.width, 72)
      .fill(COLORS.ink)
      .restore();

    doc.fillColor(COLORS.accent).font('Helvetica-Bold').fontSize(9)
      .text('PANDLOKET', PAGE.left, 22, { characterSpacing: 1.6 });
    doc.fillColor('#94a3b8').font('Helvetica').fontSize(8)
      .text('Openbaar woningrapport', PAGE.left, 36);
    doc.fillColor('#cbd5e1').font('Helvetica').fontSize(8)
      .text(datum, PAGE.left, 22, { width: W, align: 'right' });

    doc.y = 92;

    // ===== ADRES =====
    doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(22)
      .text(tekst(d.adres, 'Adres onbekend'), PAGE.left, doc.y, { width: W });
    if (d.plaats) {
      doc.moveDown(0.25);
      doc.fillColor(COLORS.dim).font('Helvetica').fontSize(11)
        .text(tekst(d.plaats), { width: W });
    }
    doc.moveDown(0.7);

    if (Array.isArray(d.chips) && d.chips.length) {
      doc.fillColor(COLORS.muted).font('Helvetica').fontSize(8.5)
        .text(d.chips.slice(0, 6).join('  ·  '), { width: W });
      doc.moveDown(0.7);
    }

    // ===== KPI RIJ =====
    sectionTitle('Kerngegevens');
    const kpiY = doc.y;
    const gap = 10;
    const kpiW = (W - gap * 3) / 4;
    const kpis = [
      { l: 'Bouwjaar', v: tekst(d.bouwjaar) },
      { l: 'Oppervlak', v: tekst(d.oppervlak) },
      { l: 'WOZ', v: tekst(d.wozKort) },
      { l: 'Energielabel', v: d.energielabel?.klasse ? String(d.energielabel.klasse) : '—' },
    ];
    kpis.forEach((k, i) => {
      const x = PAGE.left + i * (kpiW + gap);
      card(x, kpiY, kpiW, 58, (cx, cy) => {
        const isLabel = i === 3 && d.energielabel?.klasse;
        if (isLabel) {
          const c = labelKleur(d.energielabel.klasse);
          doc.save()
            .roundedRect(cx + 10, cy + 10, 28, 28, 7)
            .fill(c)
            .restore();
          doc.fillColor(COLORS.white).font('Helvetica-Bold').fontSize(13)
            .text(k.v, cx + 10, cy + 16, { width: 28, align: 'center' });
          doc.fillColor(COLORS.muted).font('Helvetica').fontSize(7)
            .text(k.l.toUpperCase(), cx + 44, cy + 20, { width: kpiW - 54 });
        } else {
          doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(13)
            .text(k.v, cx + 12, cy + 14, { width: kpiW - 24 });
          doc.fillColor(COLORS.muted).font('Helvetica').fontSize(7)
            .text(k.l.toUpperCase(), cx + 12, cy + 36, { width: kpiW - 24, characterSpacing: 0.6 });
        }
      });
    });
    doc.y = kpiY + 70;

    // ===== TWEE KOLOMMEN: energie detail + monument =====
    sectionTitle('Pand & status');
    const colGap = 12;
    const colW = (W - colGap) / 2;
    const colY = doc.y;
    const colH = 78;

    // Energielabel detail
    card(PAGE.left, colY, colW, colH, (cx, cy) => {
      doc.fillColor(COLORS.muted).font('Helvetica-Bold').fontSize(7)
        .text('ENERGIELABEL', cx + 12, cy + 12, { characterSpacing: 0.8 });
      if (d.energielabel?.klasse) {
        const el = d.energielabel;
        doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(14)
          .text(`Label ${el.klasse}`, cx + 12, cy + 28, { width: colW - 24 });
        doc.fillColor(COLORS.dim).font('Helvetica').fontSize(8.5)
          .text([
            el.gebouwtype,
            el.geldigTot ? `Geldig tot ${fmtDatum(el.geldigTot)}` : null,
          ].filter(Boolean).join('\n') || 'Geregistreerd in EP-Online',
          cx + 12, cy + 48, { width: colW - 24 });
      } else {
        doc.fillColor(COLORS.dim).font('Helvetica').fontSize(9)
          .text('Geen geregistreerd label gevonden.', cx + 12, cy + 32, { width: colW - 24 });
      }
    });

    // Monument
    card(PAGE.left + colW + colGap, colY, colW, colH, (cx, cy) => {
      doc.fillColor(COLORS.muted).font('Helvetica-Bold').fontSize(7)
        .text('MONUMENTEN', cx + 12, cy + 12, { characterSpacing: 0.8 });
      if (d.monumenten?.isMonument && d.monumenten.dichtstbij) {
        const m = d.monumenten.dichtstbij;
        doc.fillColor(COLORS.accentDark).font('Helvetica-Bold').fontSize(11)
          .text('Rijksmonument', cx + 12, cy + 28, { width: colW - 24 });
        doc.fillColor(COLORS.dim).font('Helvetica').fontSize(8.5)
          .text([
            tekst(m.naam, m.id ? `Nr. ${m.id}` : 'Ja'),
            m.afstandM != null ? `Afstand ± ${m.afstandM} m` : null,
          ].filter(Boolean).join('\n'),
          cx + 12, cy + 44, { width: colW - 24, height: 28, ellipsis: true });
      } else if (d.monumenten?.aantalInBuurt > 0) {
        doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(11)
          .text(`${d.monumenten.aantalInBuurt} in de buurt`, cx + 12, cy + 32, { width: colW - 24 });
        doc.fillColor(COLORS.dim).font('Helvetica').fontSize(8.5)
          .text('Rijksmonument(en) binnen ± 60 m', cx + 12, cy + 50, { width: colW - 24 });
      } else {
        doc.fillColor(COLORS.dim).font('Helvetica').fontSize(9)
          .text('Geen rijksmonument in de directe omgeving.', cx + 12, cy + 32, { width: colW - 24 });
      }
    });
    doc.y = colY + colH + 16;

    // ===== CBS BUURT =====
    sectionTitle(d.cbs?.jaar ? `Buurt (CBS ${d.cbs.jaar})` : 'Buurt (CBS)');
    if (d.cbs?.buurt) {
      const c = d.cbs;
      doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(11)
        .text(c.buurt + (c.gemeente ? `, ${c.gemeente}` : ''), { width: W });
      doc.moveDown(0.45);

      const stats = [
        ['Inwoners', c.inwoners != null ? c.inwoners.toLocaleString('nl-NL') : '—'],
        ['Huishoudens', c.huishoudens != null ? c.huishoudens.toLocaleString('nl-NL') : '—'],
        ['Woningen', c.woningen != null ? c.woningen.toLocaleString('nl-NL') : '—'],
        [c.jaar ? `Gem. WOZ ${c.jaar}` : 'Gem. WOZ', c.gemWoz != null ? fmtEur(Math.round(c.gemWoz)) : '—'],
        ['Koop', c.pctKoop != null ? `${c.pctKoop}%` : '—'],
        ['Huur', c.pctHuur != null ? `${c.pctHuur}%` : '—'],
      ];
      const sGap = 8;
      const sW = (W - sGap * 5) / 6;
      const sY = doc.y;
      stats.forEach((s, i) => {
        const x = PAGE.left + i * (sW + sGap);
        card(x, sY, sW, 48, (cx, cy) => {
          doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(10)
            .text(s[1], cx + 6, cy + 10, { width: sW - 12, align: 'center' });
          doc.fillColor(COLORS.muted).font('Helvetica').fontSize(6.5)
            .text(s[0].toUpperCase(), cx + 6, cy + 30, { width: sW - 12, align: 'center', characterSpacing: 0.4 });
        });
      });
      doc.y = sY + 58;
    } else {
      doc.fillColor(COLORS.dim).font('Helvetica').fontSize(9)
        .text('Geen CBS-buurtcijfers beschikbaar voor dit adres.');
      doc.moveDown(0.8);
    }

    // ===== NABIJHEID =====
    ensureSpace(100);
    sectionTitle('Nabijheid');
    if (d.nabijheid?.afstanden || d.nabijheid?.supermarket) {
      const a = d.nabijheid.afstanden || {};
      const sm = d.nabijheid.supermarket;
      const fmtKm = km => {
        if (km == null) return '—';
        if (km < 1) return `${Math.round(km * 1000)} m`;
        return `${Number(km).toLocaleString('nl-NL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`;
      };
      const fmtM = m => {
        if (m == null) return '—';
        if (m < 1000) return `${m} m`;
        return `${(m / 1000).toLocaleString('nl-NL', { maximumFractionDigits: 1 })} km`;
      };
      if (sm) {
        doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(11)
          .text(`${sm.naam} · ${fmtM(sm.afstandM)}`, { width: W });
        doc.fillColor(COLORS.dim).font('Helvetica').fontSize(8)
          .text('Dichtstbijzijnde supermarkt vanaf dit adres (OpenStreetMap)', { width: W });
        doc.moveDown(0.45);
      }
      if (d.nabijheid.buurt) {
        doc.fillColor(COLORS.dim).font('Helvetica').fontSize(8.5)
          .text(
            `Overige afstanden: buurtgemiddelde ${d.nabijheid.buurt}` +
            (d.nabijheid.jaar ? ` (${d.nabijheid.jaar})` : ''),
            { width: W },
          );
        doc.moveDown(0.35);
      }
      const nabij = [
        ['Huisarts', fmtKm(a.huisarts)],
        ['Basisschool', fmtKm(a.basisschool)],
        ['Kinderopvang', fmtKm(a.kinderopvang)],
        ['Treinstation', fmtKm(a.treinstation)],
        ['Bibliotheek', fmtKm(a.bibliotheek)],
        ['Apotheek', fmtKm(a.apotheek)],
      ];
      const nGap = 8;
      const nW = (W - nGap * 5) / 6;
      const nY = doc.y;
      nabij.forEach((s, i) => {
        const x = PAGE.left + i * (nW + nGap);
        card(x, nY, nW, 48, (cx, cy) => {
          doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(9.5)
            .text(s[1], cx + 4, cy + 10, { width: nW - 8, align: 'center' });
          doc.fillColor(COLORS.muted).font('Helvetica').fontSize(6)
            .text(s[0].toUpperCase(), cx + 4, cy + 30, { width: nW - 8, align: 'center', characterSpacing: 0.3 });
        });
      });
      doc.y = nY + 58;
    } else {
      doc.fillColor(COLORS.dim).font('Helvetica').fontSize(9)
        .text('Geen nabijheidscijfers beschikbaar.');
      doc.moveDown(0.8);
    }

    // ===== OV =====
    ensureSpace(90);
    sectionTitle('Dichtstbijzijnde OV');
    const halten = Array.isArray(d.ov?.halten) ? d.ov.halten : [];
    if (halten.length) {
      halten.slice(0, 5).forEach((h, i) => {
        ensureSpace(22);
        const y = doc.y;
        if (i > 0) {
          doc.save().strokeColor(COLORS.line).lineWidth(0.5)
            .moveTo(PAGE.left, y).lineTo(PAGE.left + W, y).stroke().restore();
          doc.y = y + 5;
        }
        const yy = doc.y;
        const soort = ({ bus: 'Bus', tram: 'Tram', metro: 'Metro', trein: 'Trein', ov: 'OV' })[h.soort] || 'OV';
        const afst = h.afstandM < 1000
          ? `${h.afstandM} m`
          : `${(h.afstandM / 1000).toLocaleString('nl-NL', { maximumFractionDigits: 1 })} km`;
        doc.fillColor(COLORS.accent).font('Helvetica-Bold').fontSize(8)
          .text(soort.toUpperCase(), PAGE.left, yy, { width: 55 });
        doc.fillColor(COLORS.ink).font('Helvetica').fontSize(9.5)
          .text(tekst(h.naam), PAGE.left + 58, yy, { width: W - 130 });
        doc.fillColor(COLORS.dim).font('Helvetica-Bold').fontSize(9)
          .text(afst, PAGE.left + W - 70, yy, { width: 70, align: 'right' });
        doc.y = yy + 16;
      });
      doc.moveDown(0.4);
    } else {
      doc.fillColor(COLORS.dim).font('Helvetica').fontSize(9)
        .text('Geen OV-halte in de buurt gevonden.');
      doc.moveDown(0.8);
    }

    // ===== WOZ =====
    ensureSpace(120);
    sectionTitle('WOZ-waardeverloop');
    if (d.wozBedrag && d.wozBedrag !== '—') {
      doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(16)
        .text(d.wozBedrag, { continued: !!d.wozDelta });
      if (d.wozDelta) {
        doc.fillColor(COLORS.ok).font('Helvetica-Bold').fontSize(10)
          .text('   ' + d.wozDelta);
      }
      doc.moveDown(0.5);
    }

    const rijen = Array.isArray(d.wozRijen) ? d.wozRijen.slice().reverse() : [];
    if (!rijen.length) {
      doc.fillColor(COLORS.dim).font('Helvetica').fontSize(9)
        .text('Geen WOZ-waarden beschikbaar voor dit adres.');
      doc.moveDown(0.6);
    } else {
      const rowH = 22;
      const tableTop = doc.y;
      // header
      doc.save().rect(PAGE.left, tableTop, W, rowH).fill(COLORS.soft).restore();
      doc.fillColor(COLORS.muted).font('Helvetica-Bold').fontSize(7.5)
        .text('PEILJAAR', PAGE.left + 12, tableTop + 7, { width: 100 })
        .text('WOZ-WAARDE', PAGE.left + 130, tableTop + 7, { width: 200 });

      rijen.forEach((r, i) => {
        const y = tableTop + rowH * (i + 1);
        ensureSpace(rowH + 8);
        const yy = i === 0 ? y : doc.y;
        // recalculate if page break happened
        const drawY = (i === 0) ? y : doc.y;
        if (i > 0 && doc.y < tableTop + rowH) {
          // after page break, redraw mini header
        }
        if (i % 2 === 1) {
          doc.save().rect(PAGE.left, drawY, W, rowH).fill(COLORS.soft2).restore();
        }
        doc.fillColor(COLORS.ink).font('Helvetica').fontSize(10)
          .text(String(r.jaar), PAGE.left + 12, drawY + 6, { width: 100 })
          .font('Helvetica-Bold')
          .text(fmtEur(r.waarde), PAGE.left + 130, drawY + 6, { width: 200 });
        doc.y = drawY + rowH;
      });
      hr(doc.y);
      doc.moveDown(0.8);
    }

    // ===== FOOTER =====
    ensureSpace(70);
    doc.moveDown(1);
    hr();
    doc.moveDown(0.55);
    doc.fillColor(COLORS.muted).font('Helvetica').fontSize(7.5)
      .text(`Pandloket · gegenereerd op ${datum}` + (order.id ? ` · order ${order.id.slice(0, 8)}` : ''), {
        width: W,
      })
      .text('Gegevens uit openbare registers (Kadaster/PDOK, Waarderingskamer, RCE, CBS, EP-Online). Geen officiële taxatie of juridisch advies.', {
        width: W,
      })
      .text('Fouten voorbehouden; hieraan kunnen geen rechten worden ontleend.', {
        width: W,
      });

    // page footer on each page
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      doc.fillColor(COLORS.muted).font('Helvetica').fontSize(7)
        .text(
          `Pandloket  ·  ${i + 1} / ${range.count}`,
          PAGE.left,
          doc.page.height - 32,
          { width: W, align: 'center' }
        );
    }

    doc.end();
    stream.on('finish', () => resolve(out));
    stream.on('error', reject);
  });
}

exports.genereerPdfBestand = genereerPdfBestand;
