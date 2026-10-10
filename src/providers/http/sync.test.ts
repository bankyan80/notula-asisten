import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../../core/errors/AppError';
import type { Meeting } from '../../core/types/entities';
import type { SyncPayload } from '../../core/types/providers';
import { HttpSyncProvider, syncEndpointFor } from './sync';

const meeting: Meeting = {
  id: 'meet-1',
  title: 'Rapat',
  date: '2026-10-07',
  participants: [],
  language: 'id',
  durationSeconds: 60,
  status: 'COMPLETED',
  storageMode: 'device',
  createdAt: '2026-10-07T09:00:00.000Z',
  updatedAt: '2026-10-07T09:00:00.000Z',
};

function payload(kind: SyncPayload['kind']): SyncPayload {
  return { kind, meetingId: 'meet-1', entityId: 'meet-1', data: { meeting } };
}

describe('syncEndpointFor — pemetaan endpoint PRD §39', () => {
  it('mencocokkan tiap entityKind ke endpoint yang benar', () => {
    expect(syncEndpointFor('meeting', 'm1')).toBe('/api/meetings');
    expect(syncEndpointFor('audio', 'm1')).toBe('/api/meetings/m1/audio-chunks');
    expect(syncEndpointFor('transcript', 'm1')).toBe('/api/meetings/m1/transcript');
    expect(syncEndpointFor('summary', 'm1')).toBe('/api/meetings/m1/summarize');
    expect(syncEndpointFor('export', 'm1')).toBe('/api/meetings/m1/export');
  });
});

describe('HttpSyncProvider', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('tanpa base URL → tidak tersedia & upload jujur menolak', async () => {
    const provider = new HttpSyncProvider('');
    expect(provider.isAvailable()).toBe(false);

    await expect(provider.upload(payload('meeting'))).rejects.toMatchObject({
      code: 'PROVIDER_UNAVAILABLE',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('dengan base URL → tersedia', () => {
    expect(new HttpSyncProvider('https://api.example.test').isAvailable()).toBe(true);
    expect(new HttpSyncProvider(' https://api.example.test/ ').isAvailable()).toBe(true);
  });

  it('upload JSON: URL, method, headers, body benar', async () => {
    fetchMock.mockResolvedValue(new Response('ok', { status: 200 }));
    const provider = new HttpSyncProvider('https://api.example.test');

    await provider.upload(payload('meeting'));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.example.test/api/meetings');
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
    const body = JSON.parse(init.body);
    expect(body.meetingId).toBe('meet-1');
    expect(body.kind).toBe('meeting');
    expect(body.data.meeting.title).toBe('Rapat');
  });

  it('slash ganda di base dirapikan', async () => {
    fetchMock.mockResolvedValue(new Response('ok', { status: 201 }));
    const provider = new HttpSyncProvider('https://api.example.test///');

    await provider.upload(payload('transcript'));
    expect(fetchMock.mock.calls[0]![0]).toBe(
      'https://api.example.test/api/meetings/meet-1/transcript',
    );
  });

  it('audio dikirim sebagai FormData (metadata chunk + file)', async () => {
    fetchMock.mockResolvedValue(new Response('ok', { status: 200 }));
    const provider = new HttpSyncProvider('https://api.example.test');

    await provider.upload({
      ...payload('audio'),
      data: {
        chunk: { id: 'chunk-1', sequence: 1 },
        blob: new Blob(['bytes'], { type: 'audio/webm' }),
        fileName: '000001.m4a',
      },
    });

    const init = fetchMock.mock.calls[0]![1];
    expect(init.body).toBeInstanceOf(FormData);
    const form = init.body as FormData;
    expect(form.get('chunk')).toContain('"sequence":1');
    const file = form.get('file');
    expect(file).toBeInstanceOf(File);
    expect((file as File).name).toBe('000001.m4a');
  });

  it('server menolak (500) → NETWORK_ERROR retryable', async () => {
    fetchMock.mockResolvedValue(new Response('nope', { status: 500 }));
    const provider = new HttpSyncProvider('https://api.example.test');

    await expect(provider.upload(payload('summary'))).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
      retryable: true,
    });
  });

  it('jaringan putus (fetch throw) → NETWORK_ERROR', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const provider = new HttpSyncProvider('https://api.example.test');

    const error = await provider.upload(payload('meeting')).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe('NETWORK_ERROR');
  });
});
