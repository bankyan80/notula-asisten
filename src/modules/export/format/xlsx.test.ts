import { describe, expect, it } from 'vitest';
import { createXlsx, type ExportTable } from './xlsx';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

async function readZipEntry(blob: Blob, entryName: string): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const nameBytes = new TextEncoder().encode(entryName);
  outer: for (let i = 0; i <= bytes.length - nameBytes.length; i += 1) {
    for (let j = 0; j < nameBytes.length; j += 1) {
      if (bytes[i + j] !== nameBytes[j]) continue outer;
    }
    return new TextDecoder().decode(bytes.slice(i + nameBytes.length));
  }
  return '';
}

const TABLES: ExportTable[] = [
  {
    name: 'Tindak Lanjut',
    rows: [
      ['Tugas', 'PIC', 'Deadline'],
      ['Kirim rekap', 'Operator', 'besok'],
    ],
  },
  {
    name: 'Keputusan',
    rows: [
      ['Keputusan', 'Sumber'],
      ['Data diverifikasi', '00:00:10'],
    ],
  },
];

describe('createXlsx — SpreadsheetML dalam ZIP (PRD §19)', () => {
  it('magic ZIP & mime XLSX benar', async () => {
    const blob = createXlsx(TABLES, 'fallback');
    expect(blob.type).toBe(XLSX_MIME);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect([bytes[0], bytes[1], bytes[2], bytes[3]]).toEqual([0x50, 0x4b, 0x03, 0x04]);
  });

  it('workbook mendaftar satu sheet per tabel', async () => {
    const blob = createXlsx(TABLES, 'fallback');
    const workbook = await readZipEntry(blob, 'xl/workbook.xml');

    expect(workbook).toContain('name="Tindak Lanjut"');
    expect(workbook).toContain('name="Keputusan"');
    expect(workbook.match(/<sheet /g)).toHaveLength(2);

    const rels = await readZipEntry(blob, 'xl/_rels/workbook.xml.rels');
    expect(rels).toContain('worksheets/sheet1.xml');
    expect(rels).toContain('worksheets/sheet2.xml');
  });

  it('isi sel memakai inlineStr berisi data (tanpa sharedStrings)', async () => {
    const blob = createXlsx(TABLES, 'fallback');
    const sheet1 = await readZipEntry(blob, 'xl/worksheets/sheet1.xml');

    expect(sheet1).toContain('t="inlineStr"');
    expect(sheet1).toContain('Kirim rekap');
    expect(sheet1).toContain('Operator');
    expect(sheet1).toContain('r="A2"');
    expect(sheet1).not.toContain('sharedStrings');
  });

  it('karakter XML pada nama sheet & sel di-escape', async () => {
    const blob = createXlsx([{ name: 'Tugas <A&B>', rows: [['kiri < kanan']] }], 'fallback');
    const workbook = await readZipEntry(blob, 'xl/workbook.xml');
    const sheet = await readZipEntry(blob, 'xl/worksheets/sheet1.xml');

    expect(workbook).toContain('Tugas &lt;A&amp;B&gt;');
    expect(sheet).toContain('kiri &lt; kanan');
  });

  it('tanpa tabel → satu sheet "Data" berisi content (fallback)', async () => {
    const blob = createXlsx([], 'Judul Rapat — 08 Oktober 2026');
    const workbook = await readZipEntry(blob, 'xl/workbook.xml');
    const sheet = await readZipEntry(blob, 'xl/worksheets/sheet1.xml');

    expect(workbook).toContain('name="Data"');
    expect(workbook.match(/<sheet /g)).toHaveLength(1);
    expect(sheet).toContain('Judul Rapat');
  });

  it('nama sheet karakter terlarang dibersihkan agar file tetap terbuka', async () => {
    const blob = createXlsx([{ name: 'a/b:c*d?e', rows: [['x']] }], 'fallback');
    const workbook = await readZipEntry(blob, 'xl/workbook.xml');

    expect(workbook).not.toContain('a/b:c*d?e');
    expect(workbook).toMatch(/name="[^"]+"/);
  });
});
