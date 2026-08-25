/*
 * A minimal .xlsx writer.
 *
 * WHY NOT A LIBRARY
 *
 * SheetJS and ExcelJS are both around a megabyte, and this bundle is already
 * nine. Neither is needed: an .xlsx is a ZIP containing a handful of XML parts,
 * and writing the few we need is less code than the wrapper around a dependency
 * would be. There is nothing to keep up to date and nothing to audit.
 *
 * WHY NOT CSV, WHICH WOULD BE FIVE LINES
 *
 * Because Excel coerces types when it opens a CSV, and one of the coercions
 * corrupts the most important column in this application:
 *
 *     070707066     ->  70707066      the leading zero is dropped
 *     105000123456  ->  1.05E+11      long identifiers go scientific
 *
 * An insurance number that has lost its leading zero no longer matches the
 * member it belongs to. That is a data fault, not a formatting one, and it
 * happens silently on open -- the file on disk is still correct, so it is easy
 * to ship a corrupted list without noticing.
 *
 * A real .xlsx can say "this cell is text", and the value survives. That is the
 * whole reason this file exists.
 *
 * The ZIP entries are STORED rather than deflated. Compression would mean
 * bundling an inflate/deflate implementation for a file that is a few hundred
 * kilobytes at worst; stored entries are valid ZIP and every spreadsheet
 * application reads them.
 */

/* --- ZIP ------------------------------------------------------------------ */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

const crc32 = (bytes) => {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
};

const utf8 = (text) => new TextEncoder().encode(text);

/**
 * A ZIP archive with stored entries.
 * @param {Array<{name: string, data: Uint8Array}>} files
 * @returns {Blob}
 */
function zip(files) {
  const chunks = [];
  const central = [];
  let offset = 0;

  const u16 = (n) => [n & 0xff, (n >>> 8) & 0xff];
  const u32 = (n) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];

  files.forEach(({ name, data }) => {
    const nameBytes = utf8(name);
    const sum = crc32(data);

    /*
     * Bit 11 marks the file name as UTF-8. Ours are ASCII, so it changes
     * nothing today -- it is set because a name that is not ASCII would
     * otherwise be read in the archiver's local code page.
     */
    const header = [
      ...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0),
      // No meaningful timestamp: a fixed one keeps the output byte-identical
      // for identical input, which makes the file testable.
      ...u16(0), ...u16(0x21),
      ...u32(sum), ...u32(data.length), ...u32(data.length),
      ...u16(nameBytes.length), ...u16(0),
    ];

    central.push([
      ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0),
      ...u16(0), ...u16(0x21),
      ...u32(sum), ...u32(data.length), ...u32(data.length),
      ...u16(nameBytes.length), ...u16(0), ...u16(0),
      ...u16(0), ...u16(0), ...u32(0), ...u32(offset),
      ...nameBytes,
    ]);

    chunks.push(new Uint8Array(header), nameBytes, data);
    offset += header.length + nameBytes.length + data.length;
  });

  const dir = central.flat();
  const end = [
    ...u32(0x06054b50), ...u16(0), ...u16(0),
    ...u16(files.length), ...u16(files.length),
    ...u32(dir.length), ...u32(offset), ...u16(0),
  ];

  chunks.push(new Uint8Array(dir), new Uint8Array(end));
  return new Blob(chunks, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

/* --- XML ------------------------------------------------------------------ */

/*
 * XML 1.0 forbids most control characters outright -- they cannot be escaped,
 * only removed -- and a single one makes the whole workbook unreadable, with
 * Excel reporting it as corrupt rather than pointing at the cell. Data typed by
 * hand into a legacy system does contain them.
 */
const escapeXml = (value) =>
  String(value)
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

/** A1, B1 ... Z1, AA1 ... for any number of columns. */
const cellRef = (index, row) => {
  let name = "";
  let n = index;
  do {
    name = String.fromCharCode(65 + (n % 26)) + name;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return `${name}${row}`;
};

const isNumber = (value) =>
  typeof value === "number" && Number.isFinite(value);

const cell = (value, index, row, bold) => {
  const ref = cellRef(index, row);
  const style = bold ? ' s="1"' : "";
  if (value === null || value === undefined || value === "") {
    return `<c r="${ref}"${style}/>`;
  }
  if (isNumber(value)) {
    return `<c r="${ref}"${style}><v>${value}</v></c>`;
  }
  // Everything else is text, explicitly. See the note at the top: this is what
  // stops Excel eating a leading zero.
  return (
    `<c r="${ref}" t="inlineStr"${style}>` +
    `<is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`
  );
};

/* --- The workbook --------------------------------------------------------- */

const contentTypes = (count) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
${Array.from({ length: count }, (_, i) =>
  `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
).join("")}
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

/* Sheets take rId1..rIdN; styles takes the one after, so adding a sheet cannot
   collide with it. */
const workbookRels = (count) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${Array.from({ length: count }, (_, i) =>
  `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
).join("")}
<Relationship Id="rId${count + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

/*
 * Two cell formats: 0 is the default, 1 is bold, used for the header row. The
 * fonts, fills, borders and cellStyleXfs lists below are the minimum Excel
 * accepts -- it rejects a styles part that omits any of them, including the
 * gray125 fill nobody uses.
 */
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>
</styleSheet>`;

const workbookXml = (names) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${names
  .map((n, i) => `<sheet name="${escapeXml(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
  .join("")}</sheets>
</workbook>`;

/*
 * Excel refuses a sheet name over 31 characters or containing : \ / ? * [ ]
 * -- and refuses the whole FILE rather than just the name, reporting it as
 * corrupt. It also refuses two sheets with the same name, so duplicates are
 * numbered rather than left to collide.
 */
const safeSheetNames = (names) => {
  const used = new Set();
  return names.map((raw) => {
    // The forward slash needs no escape inside a character class, and eslint's
    // no-useless-escape fails the build over it when CI is set. Same set of
    // characters either way: : / ? * [ ]
    let name = String(raw).replace(/[:/?*[\]]/g, " ").slice(0, 31) || "Sheet";
    let n = 2;
    while (used.has(name.toLowerCase())) {
      const suffix = ` (${n})`;
      name = name.slice(0, 31 - suffix.length) + suffix;
      n += 1;
    }
    used.add(name.toLowerCase());
    return name;
  });
};

const sheetXml = ({ columns, rows }) => {
  const header = `<row r="1">${columns.map((c, i) => cell(c.header, i, 1, true)).join("")}</row>`;
  const body = rows
    .map((row, r) => {
      const cells = columns.map((c, i) => cell(row[c.key], i, r + 2, false)).join("");
      return `<row r="${r + 2}">${cells}</row>`;
    })
    .join("");
  const cols = columns
    .map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width ?? 18}" customWidth="1"/>`)
    .join("");
  const lastCol = cellRef(columns.length - 1, 1).replace(/\d+$/, "");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<cols>${cols}</cols>
<sheetData>${header}${body}</sheetData>
<autoFilter ref="A1:${lastCol}${rows.length + 1}"/>
</worksheet>`;
};

/**
 * A workbook of one or more sheets.
 *
 * Accepts either a single sheet or { sheets: [...] }; a single sheet is the
 * common case and reads better at the call site than an array of one.
 *
 * @param {object} spec {name, columns, rows} or {sheets: [{name, columns, rows}]}
 * @returns {Blob}
 */
export function buildWorkbook(spec) {
  const sheets = spec.sheets ?? [spec];
  const names = safeSheetNames(sheets.map((s) => s.name ?? "Sheet1"));

  return zip([
    { name: "[Content_Types].xml", data: utf8(contentTypes(sheets.length)) },
    { name: "_rels/.rels", data: utf8(ROOT_RELS) },
    { name: "xl/workbook.xml", data: utf8(workbookXml(names)) },
    { name: "xl/_rels/workbook.xml.rels", data: utf8(workbookRels(sheets.length)) },
    { name: "xl/styles.xml", data: utf8(STYLES) },
    ...sheets.map((sheet, i) => ({
      name: `xl/worksheets/sheet${i + 1}.xml`,
      data: utf8(sheetXml(sheet)),
    })),
  ]);
}

/** Builds the workbook and hands it to the browser as a download. */
export function downloadWorkbook(sheet, filename) {
  const blob = buildWorkbook(sheet);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Revoked on the next tick: revoking synchronously can cancel the download in
  // Chromium before it has started reading the blob.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** dd/mm/yyyy, written as text so Excel cannot re-interpret it by locale. */
export const asDate = (value) => {
  if (!value) return "";
  const [year, month, day] = String(value).slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : String(value);
};
