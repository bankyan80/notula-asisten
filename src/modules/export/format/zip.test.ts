import { describe, expect, it } from 'vitest';
import { createZip, crc32, type ZipFile } from './zip';

async function zipBytes(files: ZipFile[]): Promise<Uint8Array> {
  return createZip(files);
}

describe('crc32', () => {
  it('menjawab 0 untuk data kosong', () => {
    expect(crc32(new Uint8Array(0))).toBe(0);
  });

  it('cocok dengan vektor "123456789" = 0xCBF43926', () => {
    const data = new TextEncoder().encode('123456789');
    expect(crc32(data)).toBe(0xcbf43926);
  });
});

describe('createZip — arsip STORE untuk DOCX/XLSX', () => {
  it('memiliki magic lokal, tengah, dan penutup ZIP', async () => {
    const zip = await zipBytes([
      { name: 'a.xml', data: new TextEncoder().encode('<a/>') },
      { name: 'b.xml', data: new TextEncoder().encode('<b/>') },
    ]);

    expect(zip[0]).toBe(0x50); // P
    expect(zip[1]).toBe(0x4b); // K
    expect(zip[2]).toBe(0x03);
    expect(zip[3]).toBe(0x04);
    expect(zip.length).toBeGreaterThan(22);

    // End of central directory tepat di akhir (tanpa komentar).
    const tail = zip.slice(zip.length - 22);
    expect(tail[0]).toBe(0x50);
    expect(tail[1]).toBe(0x4b);
    expect(tail[2]).toBe(0x05);
    expect(tail[3]).toBe(0x06);
    const entryCount = tail[10]! | (tail[11]! << 8);
    expect(entryCount).toBe(2);
  });

  it('memakai metode STORE (0), bukan kompresi', async () => {
    const zip = await zipBytes([{ name: 'x.xml', data: new TextEncoder().encode('hi') }]);
    // Local header: sig(4) + version(2) + flags(2) → metode di offset 8 (u16 LE).
    expect(zip[8]).toBe(0);
    expect(zip[9]).toBe(0);
  });

  it('CRC di header lokal sama dengan hitungan crc32 sendiri', async () => {
    const data = new TextEncoder().encode('123456789');
    const zip = await zipBytes([{ name: 'n.txt', data }]);
    const expected = crc32(data);
    const crc = zip[14]! | (zip[15]! << 8) | (zip[16]! << 16) | (zip[17]! << 24);
    expect(crc >>> 0).toBe(expected);
  });

  it('data konten di-setelah nama file utuh', async () => {
    const data = new TextEncoder().encode('isi-konten');
    const zip = await zipBytes([{ name: 'n.txt', data }]);
    const decoded = new TextDecoder().decode(zip.slice(30 + 5));
    expect(decoded).toContain('isi-konten');
  });
});
