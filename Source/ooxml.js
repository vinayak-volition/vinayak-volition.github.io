/* ---------- minimal ZIP / XLSX / DOCX writers and XLSX reader (no dependencies) ---------- */
const _te = new TextEncoder(), _td = new TextDecoder();
const _CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(u8) { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = _CRC[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function zipStore(files) {
  const parts = [], cd = []; let off = 0, cdLen = 0;
  for (const f of files) {
    const name = _te.encode(f.name), data = typeof f.data === 'string' ? _te.encode(f.data) : f.data, crc = crc32(data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(12, 0x21, true);
    lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true);
    parts.push(new Uint8Array(lh.buffer), name, data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(14, 0x21, true);
    ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, name.length, true); ch.setUint32(42, off, true);
    cd.push(new Uint8Array(ch.buffer), name); cdLen += 46 + name.length; off += 30 + name.length + data.length;
  }
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, cdLen, true); e.setUint32(16, off, true);
  const all = parts.concat(cd, [new Uint8Array(e.buffer)]);
  const out = new Uint8Array(all.reduce((n, p) => n + p.length, 0)); let p = 0;
  for (const a of all) { out.set(a, p); p += a.length; }
  return out;
}
async function inflateRaw(d) {
  if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot read compressed Excel files (DecompressionStream missing). Use a current Chrome, Edge, Safari or Firefox.');
  const r = new Response(new Blob([d]).stream().pipeThrough(new DecompressionStream('deflate-raw')));
  return new Uint8Array(await r.arrayBuffer());
}
async function unzip(u8, want) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let e = u8.length - 22; while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error('Not a valid .xlsx file');
  const n = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true); const out = {};
  for (let i = 0; i < n; i++) {
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true);
    const name = _td.decode(u8.subarray(p + 46, p + 46 + nl)); p += 46 + nl + el + cl;
    if (want && !want(name)) continue;
    const st = lo + 30 + dv.getUint16(lo + 26, true) + dv.getUint16(lo + 28, true), data = u8.subarray(st, st + csize);
    out[name] = method === 0 ? data : await inflateRaw(data);
  }
  return out;
}
function xmlUn(s) { return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(+d)).replace(/&#x([0-9a-f]+);/gi, (m, d) => String.fromCodePoint(parseInt(d, 16))).replace(/&amp;/g, '&'); }
function xmlEsc(s) { return String(s == null ? '' : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function _attrs(s) { const o = {}; s.replace(/([\w:]+)="([^"]*)"/g, (m, k, v) => { o[k] = xmlUn(v); }); return o; }
function _tText(inner) { let t = ''; inner.replace(/<rPh[\s\S]*?<\/rPh>/g, '').replace(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g, (m, x) => { t += xmlUn(x); }); return t; }
/* returns { sheetName: [ [cell,...], ... ] } (sparse arrays, 0-based) */
async function readXlsx(u8) {
  const z = await unzip(u8, n => /^xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|worksheets\/[^/]+\.xml)$/.test(n));
  const s = n => z[n] ? _td.decode(z[n]) : '';
  const shared = []; s('xl/sharedStrings.xml').replace(/<si\/>|<si>([\s\S]*?)<\/si>/g, (m, inner) => { shared.push(inner ? _tText(inner) : ''); });
  const rels = {}; s('xl/_rels/workbook.xml.rels').replace(/<Relationship\s([^>]*?)\/?>/g, (m, a) => { const o = _attrs(a); rels[o.Id] = o.Target; });
  const out = {};
  const wb = s('xl/workbook.xml'); if (!wb) throw new Error('Workbook part not found');
  wb.replace(/<sheet\s([^>]*?)\/?>/g, (m, a) => {
    const o = _attrs(a); let t = rels[o['r:id']] || ''; t = t.replace(/^\/?(xl\/)?/, 'xl/');
    const xml = s(t), rows = [];
    xml.replace(/<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g, (m2, ca, inner) => {
      const c = _attrs(ca), ref = /^([A-Z]+)(\d+)$/.exec(c.r || ''); if (!ref || inner == null) return;
      let col = 0; for (const ch of ref[1]) col = col * 26 + ch.charCodeAt(0) - 64;
      const vm = /<v>([\s\S]*?)<\/v>/.exec(inner); let v = null;
      if (c.t === 's') v = vm ? shared[+vm[1]] : null;
      else if (c.t === 'inlineStr') v = _tText(inner);
      else if (c.t === 'str') v = vm ? xmlUn(vm[1]) : null;
      else if (c.t === 'b') v = vm ? vm[1] === '1' : null;
      else if (vm) { const num = Number(vm[1]); v = isNaN(num) ? xmlUn(vm[1]) : num; }
      if (v == null || v === '') return;
      const r = +ref[2] - 1; (rows[r] || (rows[r] = []))[col - 1] = v;
    });
    out[o.name] = rows;
  });
  return out;
}
function dataUrlBytes(u) { const b = atob(u.slice(u.indexOf(',') + 1)), a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; }
function dataUrlExt(u) { return /^data:image\/png/.test(u) ? 'png' : 'jpeg'; }

/* ---------------- XLSX writer ---------------- */
function colL(n) { let s = ''; n++; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = (n - m - 1) / 26; } return s; }
class XlsxBook {
  constructor() { this.sheets = []; this.fonts = ['{}']; this.fills = []; this.xfs = ['{}']; this.fmts = []; this.media = []; }
  _idx(arr, key) { let i = arr.indexOf(key); if (i < 0) { arr.push(key); i = arr.length - 1; } return i; }
  style(o) { return o ? this._idx(this.xfs, JSON.stringify(o)) : 0; }
  addSheet(sh) { this.sheets.push(sh); return sh; }
  _styles() {
    const xfXml = this.xfs.map(k => {
      const o = JSON.parse(k);
      const font = this._idx(this.fonts, JSON.stringify({ b: o.b || 0, i: o.i || 0, sz: o.sz || 10, color: o.color || '' }));
      const fill = o.fill ? this._idx(this.fills, o.fill) + 2 : 0;
      const fmt = o.fmt ? this._idx(this.fmts, o.fmt) + 164 : 0;
      return `<xf numFmtId="${fmt}" fontId="${font}" fillId="${fill}" borderId="${o.border === 0 ? 0 : 1}" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="${o.h || 'left'}" vertical="${o.v || 'top'}"${o.wrap === 0 ? '' : ' wrapText="1"'}/></xf>`;
    });
    const fonts = this.fonts.map(k => { const o = JSON.parse(k); return `<font>${o.b ? '<b/>' : ''}${o.i ? '<i/>' : ''}<sz val="${o.sz || 10}"/>${o.color ? `<color rgb="FF${o.color}"/>` : ''}<name val="Calibri"/></font>`; });
    const fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'].concat(this.fills.map(c => `<fill><patternFill patternType="solid"><fgColor rgb="FF${c}"/><bgColor indexed="64"/></patternFill></fill>`));
    const side = t => `<${t} style="thin"><color rgb="FFB7BDC6"/></${t}>`;
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
      (this.fmts.length ? `<numFmts count="${this.fmts.length}">${this.fmts.map((f, i) => `<numFmt numFmtId="${164 + i}" formatCode="${xmlEsc(f)}"/>`).join('')}</numFmts>` : '') +
      `<fonts count="${fonts.length}">${fonts.join('')}</fonts><fills count="${fills.length}">${fills.join('')}</fills>` +
      `<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border>${side('left')}${side('right')}${side('top')}${side('bottom')}<diagonal/></border></borders>` +
      `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${xfXml.length}">${xfXml.join('')}</cellXfs>` +
      `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  }
  _sheet(sh, si) {
    let x = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">`;
    x += `<sheetViews><sheetView workbookViewId="0"${si === 0 ? ' tabSelected="1"' : ''}>`;
    if (sh.freeze) { const fr = sh.freeze.row || 0, fc = sh.freeze.col || 0; x += `<pane${fc ? ` xSplit="${fc}"` : ''}${fr ? ` ySplit="${fr}"` : ''} topLeftCell="${colL(fc)}${fr + 1}" activePane="${fr && fc ? 'bottomRight' : fr ? 'bottomLeft' : 'topRight'}" state="frozen"/>`; }
    x += `</sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/>`;
    if (sh.cols) x += '<cols>' + sh.cols.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('') + '</cols>';
    x += '<sheetData>';
    sh.rows.forEach((row, ri) => {
      const cells = Array.isArray(row) ? row : row.cells, h = Array.isArray(row) ? null : row.h;
      x += `<row r="${ri + 1}"${h ? ` ht="${h}" customHeight="1"` : ''}>`;
      cells.forEach((c, ci) => {
        if (c == null) return;
        const v = (typeof c === 'object') ? c.v : c, s = (typeof c === 'object' && c.s) ? ` s="${c.s}"` : '', ref = colL(ci) + (ri + 1);
        if (v == null || v === '') x += `<c r="${ref}"${s}/>`;
        else if (typeof v === 'number' && isFinite(v)) x += `<c r="${ref}"${s}><v>${v}</v></c>`;
        else x += `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${xmlEsc(String(v).slice(0, 32000))}</t></is></c>`;
      });
      x += '</row>';
    });
    x += '</sheetData>';
    if (sh.filter) x += `<autoFilter ref="${sh.filter}"/>`;
    if (sh.merges && sh.merges.length) x += `<mergeCells count="${sh.merges.length}">${sh.merges.map(m => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>`;
    x += '<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/><pageSetup paperSize="9" orientation="landscape" fitToHeight="0"/>';
    if (sh.images && sh.images.length) x += '<drawing r:id="rId1"/>';
    return x + '</worksheet>';
  }
  build() {
    const files = [], ct = [], wbRels = [], sheetsXml = []; let drawN = 0; const exts = new Set();
    const sheetXml = this.sheets.map((sh, i) => this._sheet(sh, i));   // registers nothing new, styles resolved before
    this.sheets.forEach((sh, i) => {
      const n = i + 1;
      files.push({ name: `xl/worksheets/sheet${n}.xml`, data: sheetXml[i] });
      ct.push(`<Override PartName="/xl/worksheets/sheet${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`);
      wbRels.push(`<Relationship Id="rId${n}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${n}.xml"/>`);
      sheetsXml.push(`<sheet name="${xmlEsc(sh.name.replace(/[\\/?*\[\]:]/g, ' ').slice(0, 31))}" sheetId="${n}" r:id="rId${n}"/>`);
      if (sh.images && sh.images.length) {
        drawN++; const dRels = []; let d = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">`;
        sh.images.forEach((im, k) => {
          const mi = this.media.length + 1, fn = `image${mi}.${im.ext}`; this.media.push(fn); exts.add(im.ext);
          files.push({ name: `xl/media/${fn}`, data: im.bytes });
          dRels.push(`<Relationship Id="rId${k + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${fn}"/>`);
          const cx = Math.round(im.w * 9525), cy = Math.round(im.h * 9525);
          d += `<xdr:oneCellAnchor><xdr:from><xdr:col>${im.col}</xdr:col><xdr:colOff>47625</xdr:colOff><xdr:row>${im.row}</xdr:row><xdr:rowOff>47625</xdr:rowOff></xdr:from><xdr:ext cx="${cx}" cy="${cy}"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${k + 2}" name="Picture ${k + 1}"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rId${k + 1}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor>`;
        });
        files.push({ name: `xl/drawings/drawing${drawN}.xml`, data: d + '</xdr:wsDr>' });
        files.push({ name: `xl/drawings/_rels/drawing${drawN}.xml.rels`, data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${dRels.join('')}</Relationships>` });
        files.push({ name: `xl/worksheets/_rels/sheet${n}.xml.rels`, data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing${drawN}.xml"/></Relationships>` });
        ct.push(`<Override PartName="/xl/drawings/drawing${drawN}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`);
      }
    });
    const sN = this.sheets.length + 1;
    wbRels.push(`<Relationship Id="rId${sN}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`);
    const head = [
      { name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${[...exts].map(e => `<Default Extension="${e}" ContentType="image/${e}"/>`).join('')}<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${ct.join('')}</Types>` },
      { name: '_rels/.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
      { name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheetsXml.join('')}</sheets></workbook>` },
      { name: 'xl/_rels/workbook.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${wbRels.join('')}</Relationships>` },
      { name: 'xl/styles.xml', data: this._styles() }
    ];
    return zipStore(head.concat(files));
  }
}

/* ---------------- DOCX writer ---------------- */
const W_NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"';
const DX = {
  run(t, o) {
    o = o || {};
    const pr = (o.b ? '<w:b/>' : '') + (o.i ? '<w:i/>' : '') + (o.color ? `<w:color w:val="${o.color}"/>` : '') + (o.sz ? `<w:sz w:val="${o.sz * 2}"/><w:szCs w:val="${o.sz * 2}"/>` : '');
    const body = String(t == null ? '' : t).split('\n').map(s => `<w:t xml:space="preserve">${xmlEsc(s)}</w:t>`).join('<w:br/>');
    return `<w:r>${pr ? `<w:rPr>${pr}</w:rPr>` : ''}${body}</w:r>`;
  },
  p(c, o) {
    o = o || {};
    const runs = Array.isArray(c) ? c.map(x => typeof x === 'string' && x.startsWith('<w:') ? x : DX.run(x, o)).join('') : (typeof c === 'string' && c.startsWith('<w:') ? c : DX.run(c, o));
    const pr = (o.style ? `<w:pStyle w:val="${o.style}"/>` : '') + (o.keep ? '<w:keepNext/>' : '') + (o.pb ? '<w:pageBreakBefore/>' : '') +
      (o.shade ? `<w:shd w:val="clear" w:color="auto" w:fill="${o.shade}"/>` : '') +
      ((o.before != null || o.after != null) ? `<w:spacing w:before="${o.before || 0}" w:after="${o.after == null ? 120 : o.after}"/>` : '') +
      (o.align ? `<w:jc w:val="${o.align}"/>` : '');
    return `<w:p>${pr ? `<w:pPr>${pr}</w:pPr>` : ''}${runs}</w:p>`;
  },
  h(t, lvl, o) { return DX.p(DX.run(t), Object.assign({ style: 'Heading' + lvl }, o || {})); },
  /* rows: [[cell]], cell = string | {t, xml, fill, b, color, sz, span, align, i} ; o = {widths:[dxa], head:1} */
  table(rows, o) {
    const W = o.widths, tot = W.reduce((a, b) => a + b, 0);
    let x = `<w:tbl><w:tblPr><w:tblW w:w="${tot}" w:type="dxa"/><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(s => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="${o.noBorder ? 'FFFFFF' : 'B7BDC6'}"/>`).join('')}</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="50" w:type="dxa"/><w:left w:w="80" w:type="dxa"/><w:bottom w:w="50" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${W.map(w => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>`;
    rows.forEach((row, ri) => {
      const isHead = o.head && ri < o.head;
      x += `<w:tr><w:trPr><w:cantSplit/>${isHead ? '<w:tblHeader/>' : ''}</w:trPr>`;
      let ci = 0;
      row.forEach(c => {
        if (c == null || typeof c !== 'object') c = { t: c == null ? '' : c };
        const span = c.span || 1, w = W.slice(ci, ci + span).reduce((a, b) => a + b, 0); ci += span;
        const fill = c.fill || (isHead ? '2F5597' : ''), ro = { b: c.b || isHead, i: c.i, color: c.color || (isHead ? 'FFFFFF' : ''), sz: c.sz || o.sz || 9 };
        const inner = c.xml || DX.p(DX.run(c.t, ro), { after: 0, align: c.align });
        x += `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${span > 1 ? `<w:gridSpan w:val="${span}"/>` : ''}${fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>` : ''}</w:tcPr>${inner}</w:tc>`;
      });
      x += '</w:tr>';
    });
    return x + '</w:tbl>' + DX.p('', { after: 60 });
  },
  pageBreak() { return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>'; }
};
class Docx {
  constructor() { this.body = []; this.media = []; this.pic = 0; }
  add(x) { this.body.push(x); return this; }
  /* returns run xml for an inline picture; wPx/hPx at 96 dpi */
  image(dataUrl, wPx, hPx) {
    const ext = dataUrlExt(dataUrl), n = this.media.length + 1; this.media.push({ name: `image${n}.${ext}`, bytes: dataUrlBytes(dataUrl), ext });
    const cx = Math.round(wPx * 9525), cy = Math.round(hPx * 9525), id = ++this.pic;
    return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id}" name="Photo ${id}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${id}" name="Photo ${id}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdImg${n}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
  }
  build(o) {
    o = o || {};
    const hdr = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr ${W_NS}>${DX.p(DX.run(o.header || '', { sz: 8, color: '6B7280' }), { after: 0, align: 'right' })}</w:hdr>`;
    const ftr = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr ${W_NS}><w:p><w:pPr><w:jc w:val="center"/></w:pPr>${DX.run((o.footer || '') + '   |   Page ', { sz: 8, color: '6B7280' })}<w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:fldChar w:fldCharType="end"/></w:r></w:p></w:ftr>`;
    const hs = (id, name, sz, color, before, after) => `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="${before}" w:after="${after}"/>${/^Heading/.test(id) ? `<w:outlineLvl w:val="${+id.slice(7) - 1}"/>` : ''}</w:pPr><w:rPr><w:b/><w:color w:val="${color}"/><w:sz w:val="${sz * 2}"/><w:szCs w:val="${sz * 2}"/></w:rPr></w:style>`;
    const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${W_NS}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri" w:eastAsia="Calibri"/><w:sz w:val="20"/><w:szCs w:val="20"/><w:lang w:val="en-IN"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="252" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>${hs('Title', 'Title', 26, '1F3864', 0, 200)}${hs('Heading1', 'heading 1', 15, '1F3864', 320, 140)}${hs('Heading2', 'heading 2', 12, '2F5597', 220, 100)}${hs('Heading3', 'heading 3', 10.5, '2F5597', 160, 80)}</w:styles>`;
    const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W_NS}><w:body>${this.body.join('')}<w:sectPr><w:headerReference w:type="default" r:id="rIdH"/><w:footerReference w:type="default" r:id="rIdF"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1021" w:bottom="1134" w:left="1021" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr></w:body></w:document>`;
    const exts = new Set(this.media.map(m => m.ext));
    const files = [
      { name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${[...exts].map(e => `<Default Extension="${e}" ContentType="image/${e}"/>`).join('')}<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>` },
      { name: '_rels/.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>` },
      { name: 'word/document.xml', data: doc },
      { name: 'word/_rels/document.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdS" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdH" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/><Relationship Id="rIdF" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>${this.media.map((m, i) => `<Relationship Id="rIdImg${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${m.name}"/>`).join('')}</Relationships>` },
      { name: 'word/styles.xml', data: styles }, { name: 'word/header1.xml', data: hdr }, { name: 'word/footer1.xml', data: ftr }
    ].concat(this.media.map(m => ({ name: 'word/media/' + m.name, data: m.bytes })));
    return zipStore(files);
  }
}
