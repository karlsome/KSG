// Small helpers on top of docx-js so the content file stays readable.
const fs = require('fs');
const path = require('path');
const {
  Paragraph, TextRun, Table, TableRow, TableCell, ImageRun, AlignmentType, LevelFormat,
  HeadingLevel, BorderStyle, WidthType, ShadingType, PageBreak,
} = require('docx');

const CONTENT_W = 9026; // A4 with 1" margins, in DXA
const FONT = 'Arial';
const MONO = 'Consolas';
const SHOTS = path.join(__dirname, 'shots');

// Inline markup: **bold**, `code`
function runs(text, base = {}) {
  const out = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(new TextRun({ text: text.slice(last, m.index), ...base }));
    const tok = m[0];
    if (tok.startsWith('**')) out.push(new TextRun({ text: tok.slice(2, -2), bold: true, ...base }));
    else out.push(new TextRun({ text: tok.slice(1, -1), font: MONO, size: 19, color: '9D174D', ...base }));
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(new TextRun({ text: text.slice(last), ...base }));
  return out;
}

const H1 = (t, pageBreak = true) => new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: pageBreak, children: [new TextRun(t)] });
const H2 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(t)] });
const H3 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun(t)] });
const P = (t, opts = {}) => new Paragraph({ spacing: { after: 120 }, ...opts, children: runs(t) });

let listCounter = 0;
const numberingConfigs = [];
function newNumberRef() {
  const ref = `num${++listCounter}`;
  numberingConfigs.push({
    reference: ref,
    levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT,
      style: { paragraph: { indent: { left: 720, hanging: 360 } } } }],
  });
  return ref;
}
const bulletConfig = {
  reference: 'bullets',
  levels: [
    { level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT,
      style: { paragraph: { indent: { left: 720, hanging: 360 } } } },
    { level: 1, format: LevelFormat.BULLET, text: '–', alignment: AlignmentType.LEFT,
      style: { paragraph: { indent: { left: 1440, hanging: 360 } } } },
  ],
};

// items: strings, or [string, level]
const bullets = (items) => items.map((it) => {
  const [t, lvl] = Array.isArray(it) ? it : [it, 0];
  return new Paragraph({ numbering: { reference: 'bullets', level: lvl }, spacing: { after: 60 }, children: runs(t) });
});
const steps = (items) => {
  const ref = newNumberRef();
  return items.map((t) => new Paragraph({ numbering: { reference: ref, level: 0 }, spacing: { after: 80 }, children: runs(t) }));
};

const border = { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' };
const borders = { top: border, bottom: border, left: border, right: border };

function table(headers, rows, widths) {
  const total = widths.reduce((a, b) => a + b, 0);
  const scale = CONTENT_W / total;
  const w = widths.map((x) => Math.floor(x * scale));
  w[w.length - 1] += CONTENT_W - w.reduce((a, b) => a + b, 0);
  const cell = (text, i, head) => new TableCell({
    borders, width: { size: w[i], type: WidthType.DXA },
    shading: head ? { fill: '1E3A5F', type: ShadingType.CLEAR, color: 'auto' } : undefined,
    margins: { top: 70, bottom: 70, left: 110, right: 110 },
    children: String(text).split('\n').map((line) => new Paragraph({
      children: runs(line, head ? { bold: true, color: 'FFFFFF', size: 19 } : { size: 19 }),
    })),
  });
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: w,
    rows: [
      new TableRow({ tableHeader: true, children: headers.map((h, i) => cell(h, i, true)) }),
      ...rows.map((r) => new TableRow({ children: r.map((c, i) => cell(c, i, false)) })),
    ],
  });
}

// Shaded call-out box. kind: note | warn | tip
function callout(kind, title, lines) {
  const palette = { note: ['EFF6FF', '1D4ED8'], warn: ['FEF2F2', 'B91C1C'], tip: ['ECFDF5', '047857'] }[kind];
  const b = { style: BorderStyle.SINGLE, size: 4, color: palette[1] };
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: [CONTENT_W],
    rows: [new TableRow({ cantSplit: true, children: [new TableCell({
      borders: { top: b, bottom: b, right: b, left: { style: BorderStyle.SINGLE, size: 24, color: palette[1] } },
      width: { size: CONTENT_W, type: WidthType.DXA },
      shading: { fill: palette[0], type: ShadingType.CLEAR, color: 'auto' },
      margins: { top: 100, bottom: 100, left: 160, right: 160 },
      children: [
        new Paragraph({ keepNext: true, spacing: { after: 60 }, children: [new TextRun({ text: title, bold: true, color: palette[1] })] }),
        ...[].concat(lines).map((l) => new Paragraph({ spacing: { after: 40 }, children: runs(l, { size: 20 }) })),
      ],
    })] })],
  });
}

function code(lines) {
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: [CONTENT_W],
    rows: [new TableRow({ children: [new TableCell({
      borders, width: { size: CONTENT_W, type: WidthType.DXA },
      shading: { fill: 'F1F5F9', type: ShadingType.CLEAR, color: 'auto' },
      margins: { top: 90, bottom: 90, left: 160, right: 160 },
      children: lines.map((l) => new Paragraph({ children: [new TextRun({ text: l || ' ', font: MONO, size: 18 })] })),
    })] })],
  });
}

let figNo = 0;
let figLabel = (n) => `Figure ${n}: `;
const setFigureLabel = (fn) => { figLabel = fn; };
function figure(file, caption, widthPx = 600) {
  const full = path.join(SHOTS, file);
  const data = fs.readFileSync(full);
  const { w, h } = imageSize(data, file);
  const height = Math.round((h / w) * widthPx);
  figNo += 1;
  return [
    new Paragraph({ alignment: AlignmentType.CENTER, keepNext: true, keepLines: true, spacing: { before: 120, after: 40 }, children: [
      new ImageRun({ type: file.endsWith('.png') ? 'png' : 'jpg', data,
        transformation: { width: widthPx, height },
        altText: { title: caption, description: caption, name: file } }),
    ] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [
      new TextRun({ text: `${figLabel(figNo)}${caption}`, italics: true, size: 18, color: '475569' }),
    ] }),
  ];
}

function imageSize(buf, name) {
  if (name.endsWith('.png')) return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  let i = 2; // JPEG: walk segments to SOF
  while (i < buf.length) {
    const marker = buf[i + 1];
    const len = buf.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xc3) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    i += 2 + len;
  }
  throw new Error('size?');
}

const spacer = () => new Paragraph({ spacing: { after: 120 }, children: [] });
const pageBreak = () => new Paragraph({ children: [new PageBreak()] });

module.exports = { setFigureLabel, H1, H2, H3, P, bullets, steps, table, callout, code, figure, spacer, pageBreak, runs,
  numberingConfigs, bulletConfig, FONT, CONTENT_W };
