import { describe, expect, it } from 'vitest';
import { createDocx } from './docx';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

async function readZipEntry(blob: Blob, entryName: string): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  // Cari nama berkas di header lokal, XML tepat setelah header + nama.
  const nameBytes = new TextEncoder().encode(entryName);
  outer: for (let i = 0; i <= bytes.length - nameBytes.length; i += 1) {
    for (let j = 0; j < nameBytes.length; j += 1) {
      if (bytes[i + j] !== nameBytes[j]) continue outer;
    }
    const dataStart = i + nameBytes.length;
    const xmlBytes = bytes.slice(dataStart);
    return new TextDecoder().decode(xmlBytes);
  }
  return '';
}

describe('createDocx — .docx = ZIP OOXML (PRD §19.2)', () => {
  it('magic ZIP & mime DOCX benar', async () => {
    const blob = createDocx('Isi notulen');
    expect(blob.type).toBe(DOCX_MIME);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect([bytes[0], bytes[1], bytes[2], bytes[3]]).toEqual([0x50, 0x4b, 0x03, 0x04]);
    expect(blob.size).toBeGreaterThan(100);
  });

  it('memuat document.xml dengan paragraf per baris', async () => {
    const blob = createDocx('BARIS SATU\nBARIS DUA');
    const documentXml = await readZipEntry(blob, 'word/document.xml');

    expect(documentXml).toContain('<w:document');
    expect(documentXml).toContain('<w:body>');
    expect(documentXml.match(/<w:p>/g)).toHaveLength(2);
    expect(documentXml).toContain('BARIS SATU');
    expect(documentXml).toContain('BARIS DUA');
  });

  it('memuat [Content_Types].xml & _rels/.rels agar dikenali Word', async () => {
    const blob = createDocx('x');
    const types = await readZipEntry(blob, '[Content_Types].xml');
    const rels = await readZipEntry(blob, '_rels/.rels');

    expect(types).toContain('wordprocessingml.document.main+xml');
    expect(rels).toContain('word/document.xml');
  });

  it('karakter XML di-escape', async () => {
    const blob = createDocx('R&D <b>aman</b> "teks" \'ini\'');
    const documentXml = await readZipEntry(blob, 'word/document.xml');

    expect(documentXml).toContain('R&amp;D');
    expect(documentXml).toContain('&lt;b&gt;aman&lt;/b&gt;');
    expect(documentXml).not.toContain('<b>aman</b>');
  });
});
