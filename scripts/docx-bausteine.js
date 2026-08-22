/**
 * Erzeugt docs/Sensor-Bauanleitung.docx
 *
 *   npm run anleitung
 *
 * Quelle der Wahrheit für Pinbelegung und Einstellungen ist
 * firmware/altkleider-sensor/include/konfiguration.h - bei Änderungen dort
 * dieses Skript nachziehen und neu erzeugen.
 */

const fs = require("node:fs");
const path = require("node:path");
const {
  AlignmentType, BorderStyle, Document, Footer, HeadingLevel, LevelFormat,
  PageBreak, PageNumber, Packer, Paragraph, ShadingType, Table, TableCell,
  TableRow, TextRun, WidthType, VerticalAlign,
} = require("docx");

// A4 hochkant, 2 cm Rand -> nutzbare Breite in DXA (1440 = 1 Zoll)
const BREITE = 9070;

const FARBE = {
  text: "1A1A1A",
  leise: "5A5A5A",
  linie: "D5D5D0",
  kopf: "EFEFEA",
  achtung: "FDECEC",
  achtungRand: "D03B3B",
  hinweis: "EAF2FC",
  hinweisRand: "2A78D6",
  tipp: "EDF7ED",
  tippRand: "0CA30C",
  brk: "C1121F",
};

// ---------------------------------------------------------------- Bausteine

const h1 = (text) =>
  new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 400, after: 160 },
    children: [new TextRun({ text, bold: true, size: 30, color: FARBE.brk })],
  });

const h2 = (text) =>
  new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 300, after: 120 },
    children: [new TextRun({ text, bold: true, size: 25, color: FARBE.text })],
  });

const h3 = (text) =>
  new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 220, after: 90 },
    children: [new TextRun({ text, bold: true, size: 22, color: FARBE.text })],
  });

const p = (text, opts = {}) =>
  new Paragraph({
    spacing: { after: opts.after ?? 120, line: 276 },
    alignment: opts.align,
    children: [
      new TextRun({
        text,
        size: opts.size ?? 21,
        italics: opts.kursiv,
        bold: opts.fett,
        color: opts.leise ? FARBE.leise : FARBE.text,
      }),
    ],
  });

/** Absatz aus mehreren Textteilen, z. B. für fett gesetzte Stellen. */
const pm = (teile, opts = {}) =>
  new Paragraph({
    spacing: { after: opts.after ?? 120, line: 276 },
    children: teile.map((t) =>
      typeof t === "string"
        ? new TextRun({ text: t, size: 21, color: FARBE.text })
        : new TextRun({
            text: t.text,
            bold: t.fett,
            italics: t.kursiv,
            font: t.mono ? "Consolas" : undefined,
            size: t.mono ? 19 : 21,
            color: t.leise ? FARBE.leise : FARBE.text,
          }),
    ),
  });

const punkte = (eintraege) =>
  eintraege.map(
    (text) =>
      new Paragraph({
        numbering: { reference: "striche", level: 0 },
        spacing: { after: 60, line: 276 },
        children: [new TextRun({ text, size: 21, color: FARBE.text })],
      }),
  );

const code = (zeilen) =>
  zeilen.map(
    (zeile, i) =>
      new Paragraph({
        spacing: { after: i === zeilen.length - 1 ? 140 : 0, before: i === 0 ? 40 : 0 },
        shading: { type: ShadingType.CLEAR, fill: "F4F4F1" },
        indent: { left: 220, right: 220 },
        children: [new TextRun({ text: zeile || " ", font: "Consolas", size: 18, color: FARBE.text })],
      }),
  );

/** Farbig hinterlegter Kasten für Warnungen, Hinweise, Tipps. */
function kasten(titel, absaetze, art = "hinweis") {
  const fuellung = { achtung: FARBE.achtung, hinweis: FARBE.hinweis, tipp: FARBE.tipp }[art];
  const rand = { achtung: FARBE.achtungRand, hinweis: FARBE.hinweisRand, tipp: FARBE.tippRand }[art];

  const inhalt = [
    new Paragraph({
      spacing: { after: 60 },
      children: [new TextRun({ text: titel, bold: true, size: 21, color: FARBE.text })],
    }),
    ...absaetze.map(
      (t, i) =>
        new Paragraph({
          spacing: { after: i === absaetze.length - 1 ? 0 : 80, line: 276 },
          children: [new TextRun({ text: t, size: 20, color: FARBE.text })],
        }),
    ),
  ];

  return new Table({
    width: { size: BREITE, type: WidthType.DXA },
    columnWidths: [BREITE],
    borders: {
      top: { style: BorderStyle.SINGLE, size: 2, color: fuellung },
      bottom: { style: BorderStyle.SINGLE, size: 2, color: fuellung },
      right: { style: BorderStyle.SINGLE, size: 2, color: fuellung },
      left: { style: BorderStyle.SINGLE, size: 18, color: rand },
      insideHorizontal: { style: BorderStyle.NONE },
      insideVertical: { style: BorderStyle.NONE },
    },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: BREITE, type: WidthType.DXA },
            shading: { type: ShadingType.CLEAR, fill: fuellung },
            margins: { top: 140, bottom: 140, left: 200, right: 200 },
            children: inhalt,
          }),
        ],
      }),
    ],
  });
}

const abstand = (hoehe = 120) => new Paragraph({ spacing: { after: hoehe }, children: [] });

/** Tabelle mit Kopfzeile. `spalten` sind die Breiten in DXA. */
function tabelle(kopf, zeilen, spalten, opts = {}) {
  const zelle = (inhalt, breite, { fett = false, fuellung, mono = false } = {}) =>
    new TableCell({
      width: { size: breite, type: WidthType.DXA },
      shading: fuellung ? { type: ShadingType.CLEAR, fill: fuellung } : undefined,
      margins: { top: 90, bottom: 90, left: 130, right: 130 },
      verticalAlign: VerticalAlign.CENTER,
      children: String(inhalt)
        .split("\n")
        .map(
          (zeile, i, alle) =>
            new Paragraph({
              spacing: { after: i === alle.length - 1 ? 0 : 40, line: 264 },
              children: [
                new TextRun({
                  text: zeile,
                  bold: fett,
                  size: mono ? 18 : 20,
                  font: mono ? "Consolas" : undefined,
                  color: FARBE.text,
                }),
              ],
            }),
        ),
    });

  return new Table({
    width: { size: BREITE, type: WidthType.DXA },
    columnWidths: spalten,
    borders: {
      top: { style: BorderStyle.SINGLE, size: 2, color: FARBE.linie },
      bottom: { style: BorderStyle.SINGLE, size: 2, color: FARBE.linie },
      left: { style: BorderStyle.NONE },
      right: { style: BorderStyle.NONE },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: FARBE.linie },
      insideVertical: { style: BorderStyle.NONE },
    },
    rows: [
      new TableRow({
        tableHeader: true,
        children: kopf.map((t, i) => zelle(t, spalten[i], { fett: true, fuellung: FARBE.kopf })),
      }),
      ...zeilen.map(
        (zeile) =>
          new TableRow({
            children: zeile.map((t, i) =>
              zelle(t, spalten[i], { mono: opts.monoSpalten?.includes(i) }),
            ),
          }),
      ),
    ],
  });
}

module.exports = {
  AlignmentType, BorderStyle, BREITE, Document, FARBE, Footer, HeadingLevel,
  LevelFormat, PageBreak, PageNumber, Packer, Paragraph, ShadingType, Table,
  TableCell, TableRow, TextRun, WidthType,
  h1, h2, h3, p, pm, punkte, code, kasten, abstand, tabelle, fs, path,
};
