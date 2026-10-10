import { describe, expect, it } from 'vitest';
import { AppError } from '../../core/errors/AppError';
import { OpfsStorageProvider } from './opfsStorage';

/**
 * jsdom TIDAK punya OPFS — provider harus jujur melempar AppError
 * (bukan berpura-pura menulis), dan estimate tidak mengarang angka.
 */
describe('OpfsStorageProvider (lingkungan tanpa OPFS)', () => {
  const provider = new OpfsStorageProvider();

  it('writeBlob/melempar PROVIDER_UNAVAILABLE', async () => {
    await expect(
      provider.writeBlob('Meetings/abc/audio/000001.m4a', new Blob(['x'])),
    ).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' });
  });

  it('readText menolak dengan jujur', async () => {
    await expect(provider.readText('Meetings/abc/transcript/seg.txt')).rejects.toBeInstanceOf(
      AppError,
    );
  });

  it('exists melempar (bukan false palsu) saat OPFS tak tersedia', async () => {
    await expect(provider.exists('Meetings/abc/audio/000001.m4a')).rejects.toMatchObject({
      code: 'PROVIDER_UNAVAILABLE',
    });
  });

  it('removeMeeting tidak gagal bila memang tidak ada penyimpanan', async () => {
    await expect(provider.removeMeeting('abc')).rejects.toMatchObject({
      code: 'PROVIDER_UNAVAILABLE',
    });
  });

  it('list melempar PROVIDER_UNAVAILABLE (bukan daftar kosong palsu)', async () => {
    await expect(provider.list('Meetings/abc/audio')).rejects.toMatchObject({
      code: 'PROVIDER_UNAVAILABLE',
    });
  });

  it('estimate tidak mengarang angka', async () => {
    const info = await provider.estimate();
    expect(info.isEstimated).toBe(true);
    expect(info.freeBytes).toBeUndefined();
    expect(info.usedBytes).toBeUndefined();
  });
});
