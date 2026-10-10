import { describe, expect, it } from 'vitest';
import type { Meeting } from '../../core/types/entities';
import { AppError } from '../../core/errors/AppError';
import { LocalExportProvider } from './localExport';

const meeting: Meeting = {
  id: 'meet-1',
  title: 'Rapat Kurikulum',
  date: '2026-10-07',
  participants: [],
  language: 'id',
  durationSeconds: 60,
  status: 'COMPLETED',
  storageMode: 'device',
  createdAt: '2026-10-07T09:00:00.000Z',
  updatedAt: '2026-10-07T09:00:00.000Z',
};

const provider = new LocalExportProvider();

describe('LocalExportProvider', () => {
  it('mendukung 4 format PRD §19, menolak CSV dengan jujur', () => {
    expect(provider.supports('PDF')).toBe(true);
    expect(provider.supports('DOCX')).toBe(true);
    expect(provider.supports('TXT')).toBe(true);
    expect(provider.supports('XLSX')).toBe(true);
    expect(provider.supports('CSV')).toBe(false);
  });

  it('PDF: mime & ekstensi benar, blob bukan kosong', async () => {
    const result = await provider.export({ meeting, format: 'PDF', content: 'NOTULEN RAPAT' });

    expect(result.mimeType).toBe('application/pdf');
    expect(result.fileName).toBe('Rapat Kurikulum 2026-10-07.pdf');
    expect(result.blob.size).toBeGreaterThan(0);
    const bytes = new Uint8Array(await result.blob.arrayBuffer());
    expect(bytes[0]).toBe(0x25); // '%'
    expect(bytes[1]).toBe(0x50); // 'P'
  });

  it('DOCX & XLSX: mime OOXML + blob ZIP nyata', async () => {
    const docx = await provider.export({
      meeting,
      format: 'DOCX',
      content: 'Isi notulen',
    });
    const xlsx = await provider.export({
      meeting,
      format: 'XLSX',
      content: 'Isi',
      tables: [{ name: 'Tugas', rows: [['Tugas'], ['A']] }],
    });

    expect(docx.mimeType).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    expect(docx.fileName.endsWith('.docx')).toBe(true);
    expect(xlsx.mimeType).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(xlsx.fileName.endsWith('.xlsx')).toBe(true);

    const docxBytes = new Uint8Array(await docx.blob.arrayBuffer());
    const xlsxBytes = new Uint8Array(await xlsx.blob.arrayBuffer());
    expect([docxBytes[0], docxBytes[1]]).toEqual([0x50, 0x4b]);
    expect([xlsxBytes[0], xlsxBytes[1]]).toEqual([0x50, 0x4b]);
  });

  it('TXT: teks apa adanya', async () => {
    const result = await provider.export({
      meeting,
      format: 'TXT',
      content: '00:00:00 — Pembicara 1',
    });

    expect(result.mimeType).toBe('text/plain;charset=utf-8');
    expect(result.fileName.endsWith('.txt')).toBe(true);
    expect(await result.blob.text()).toBe('00:00:00 — Pembicara 1');
  });

  it('format tak didukung → AppError PROVIDER_UNAVAILABLE', async () => {
    await expect(provider.export({ meeting, format: 'CSV', content: 'a,b' })).rejects.toMatchObject(
      { code: 'PROVIDER_UNAVAILABLE' },
    );
    await expect(
      provider.export({ meeting, format: 'CSV', content: 'a,b' }),
    ).rejects.toBeInstanceOf(AppError);
  });
});
