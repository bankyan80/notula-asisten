/**
 * Generator XLSX minimal (Batch 11) — tanpa dependensi.
 * Berkas .xlsx = arsip ZIP berisi SpreadsheetML: [Content_Types].xml,
 * _rels/.rels, xl/workbook.xml, xl/_rels/workbook.xml.rels, xl/worksheets/sheetN.xml.
 * Sel memakai inline string (tanpa sharedStrings).
 */
import { zipToBlob, type ZipFile } from './zip';

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export interface ExportTable {
  name: string;
  rows: string[][];
}

/** Nama sheet valid Excel: ≤31 karakter, tanpa karakter terlarang. */
function safeSheetName(name: string, fallback: string): string {
  const cleaned = name.replace(/[[\]:*?/\\]/g, ' ').trim();
  const limited = cleaned.slice(0, 31);
  return limited.length > 0 ? limited : fallback;
}

function columnLetter(index: number): string {
  let n = index;
  let letters = '';
  do {
    letters = String.fromCharCode(65 + (n % 26)) + letters;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return letters;
}

function sheetXml(rows: string[][]): string {
  const body = rows
    .map((cells, rowIndex) => {
      const rowNumber = rowIndex + 1;
      const cellXml = cells
        .map((cell, colIndex) => {
          const ref = `${columnLetter(colIndex)}${rowNumber}`;
          return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(
            cell ?? '',
          )}</t></is></c>`;
        })
        .join('');
      return `<row r="${rowNumber}">${cellXml}</row>`;
    })
    .join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
}

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export function createXlsx(tables: ExportTable[], content: string): Blob {
  const safeTables: ExportTable[] =
    tables.length > 0
      ? tables.map((table, index) => ({
          ...table,
          name: safeSheetName(table.name, `Sheet${index + 1}`),
        }))
      : [{ name: 'Data', rows: [[content]] }];

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${safeTables
    .map(
      (_, index) =>
        `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
    )
    .join('')}</Types>`;

  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;

  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${safeTables
    .map(
      (table, index) =>
        `<sheet name="${escapeXml(table.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`,
    )
    .join('')}</sheets></workbook>`;

  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${safeTables
    .map(
      (_, index) =>
        `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
    )
    .join('')}</Relationships>`;

  const encoder = new TextEncoder();
  const files: ZipFile[] = [
    { name: '[Content_Types].xml', data: encoder.encode(contentTypes) },
    { name: '_rels/.rels', data: encoder.encode(rootRels) },
    { name: 'xl/workbook.xml', data: encoder.encode(workbook) },
    { name: 'xl/_rels/workbook.xml.rels', data: encoder.encode(workbookRels) },
    ...safeTables.map((table, index) => ({
      name: `xl/worksheets/sheet${index + 1}.xml`,
      data: encoder.encode(sheetXml(table.rows)),
    })),
  ];

  return zipToBlob(files, XLSX_MIME);
}
