import { describe, expect, it } from 'vitest';
import { createPdf } from './pdf';

async function toLatin1Text(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let text = '';
  for (const byte of bytes) text += String.fromCharCode(byte);
  return text;
}

describe('createPdf — PDF 1.4 tanpa dependensi', () => {
  it('menghasilkan header, xref, dan trailer yang sah', async () => {
    const blob = createPdf('JUDUL RAPAT\n\nIsi notulen.');
    const text = await toLatin1Text(blob);

    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(text).toContain('trailer');
    expect(text).toContain('/Root 1 0 R');
    expect(text).toContain('startxref');

    // startxref menunjuk tepat ke objek "xref".
    const match = text.match(/startxref\n(\d+)\n%%EOF$/);
    expect(match).not.toBeNull();
    expect(text.slice(Number(match![1]))).toMatch(/^xref\n/);
  });

  it('baris panjang di-wrap dan konten muncul di content stream', async () => {
    const longLine = 'kata panjang '.repeat(40).trim();
    const text = await toLatin1Text(createPdf(longLine));

    expect(text).toContain('stream\n');
    expect(text).toContain('ET');
    // Wrap memecah menjadi beberapa Tj — tidak ada satu Tj dgn seluruh 480 char.
    expect(text).not.toContain(longLine);
    expect(text).toContain('kata panjang');
  });

  it('multi-halaman untuk konten panjang', async () => {
    const lines = Array.from({ length: 200 }, (_, index) => `Baris nomor ${index} adalah teks.`);
    const text = await toLatin1Text(createPdf(lines.join('\n')));

    const count = text.match(/\/Count (\d+)/);
    expect(count).not.toBeNull();
    expect(Number(count![1])).toBeGreaterThanOrEqual(2);
    expect(text).toContain('/Type /Page ');
  });

  it('karakter di luar Latin-1 disaring aman (tetap byte sah)', async () => {
    const text = await toLatin1Text(createPdf('Halo 😀 dan café tëks 日本語'));
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text).toContain('Halo');
    // Tidak ada byte di atas 0xFF — LATIN-1 murni.
    for (let i = 0; i < text.length; i += 1) {
      expect(text.charCodeAt(i)).toBeLessThanOrEqual(0xff);
    }
  });

  it('tanda kurung & backslash di-escape sehingga stream tetap utuh', async () => {
    const text = await toLatin1Text(createPdf('Status (sementara) pakai back\\slash'));
    expect(text).toContain('\\(sementara\\)');
    expect(text).toContain('back\\\\slash');
  });
});
