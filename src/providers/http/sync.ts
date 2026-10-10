/**
 * Sinkronisasi cloud via HTTP (Batch 12) — endpoint contoh PRD §39.
 * TANPA backend → `isAvailable() === false` (jujur, tidak pura-pura mengunggah).
 * Diuji dengan stub `fetch`: URL/method/body disi; bukan fitur palsu.
 */
import { AppError } from '../../core/errors/AppError';
import { config } from '../../core/config/env';
import type { SyncEntityKind } from '../../core/types/entities';
import type { AudioSyncData, SyncPayload, SyncProvider } from '../../core/types/providers';

/** Peta entity → endpoint PRD §39. */
export function syncEndpointFor(kind: SyncEntityKind, meetingId: string): string {
  switch (kind) {
    case 'meeting':
      return '/api/meetings';
    case 'audio':
      return `/api/meetings/${meetingId}/audio-chunks`;
    case 'transcript':
      return `/api/meetings/${meetingId}/transcript`;
    case 'summary':
      return `/api/meetings/${meetingId}/summarize`;
    case 'export':
      return `/api/meetings/${meetingId}/export`;
  }
}

export class HttpSyncProvider implements SyncProvider {
  readonly id = 'http-sync';
  private readonly baseUrl: string;

  constructor(baseUrl: string = config.VITE_API_BASE_URL) {
    this.baseUrl = baseUrl.trim().replace(/\/+$/, '');
  }

  isAvailable(): boolean {
    return this.baseUrl !== '';
  }

  async upload(payload: SyncPayload): Promise<void> {
    if (!this.isAvailable()) {
      throw new AppError(
        'PROVIDER_UNAVAILABLE',
        'Backend sinkronisasi belum dikonfigurasi (VITE_API_BASE_URL kosong).',
      );
    }

    const url = `${this.baseUrl}${syncEndpointFor(payload.kind, payload.meetingId)}`;
    let response: Response;
    try {
      if (payload.kind === 'audio') {
        const data = payload.data as AudioSyncData;
        const form = new FormData();
        form.append('chunk', JSON.stringify(data.chunk));
        form.append('file', data.blob, data.fileName);
        response = await fetch(url, { method: 'POST', body: form });
      } else {
        response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            meetingId: payload.meetingId,
            entityId: payload.entityId,
            kind: payload.kind,
            data: payload.data,
          }),
        });
      }
    } catch (error) {
      throw new AppError('NETWORK_ERROR', 'Koneksi terputus saat mengunggah.', {
        cause: error,
        retryable: true,
      });
    }

    if (!response.ok) {
      throw new AppError('NETWORK_ERROR', `Server menolak unggahan (HTTP ${response.status}).`, {
        retryable: response.status >= 500 || response.status === 429,
        context: { status: response.status, url },
      });
    }
  }
}
