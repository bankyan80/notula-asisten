/**
 * Suite acceptance PRD §52 — satu test per kriteria penerimaan produk.
 *
 * Level: repository + komponen (integrasi lokal, tanpa backend) — sama seperti
 * PRD §26 "audit log"/keamanan server yang ditunda ke versi backend.
 * Kriteria yang bergantung hardware Android (§52 #3) diuji lewat mekanisme
 * web yang setara: manifes pemulihan chunk pasca-crash (foreground service
 * Android dikerjakan pada Batch 14 — lihat IMPLEMENTATION-PLAN).
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RepositoriesProvider } from './RepositoriesContext';
import { useToastStore } from './toastStore';
import { clearAllLocalData, getRepositories, resetRepositories } from '../data';
import type { Meeting, TranscriptSegment } from '../core/types/entities';
import { AppError } from '../core/errors/AppError';
import { createId } from '../core/utils/id';
import { nowIso } from '../core/utils/time';
import { audioChunkPath, audioManifestPath } from '../core/utils/paths';
import { getExportProvider } from '../providers';
import { summarizeExtractive } from '../providers/extractive/extractSummary';
import { searchSegments } from '../modules/search/searchSegments';
import { findActiveSegment } from '../modules/audio/timeline';
import { pickSpeakerCodeForSegment } from '../modules/speakers/assignSpeakers';
import { generateMinutes } from '../modules/minutes/generator';
import { buildExportRequest } from '../modules/export/contentBuilder';
import { recoverMeeting } from '../modules/recording/recovery';
import { ExtractiveAISummarizationProvider } from '../providers/extractive/extractiveSummary';
import { MemStorage } from '../modules/recording/memStorage';
import { createMemoryRepositories } from '../data/memory/repositories';
import { removeMeetingFiles } from '../modules/storage/meetingFiles';
import { TranscriptTab } from '../modules/transcript/TranscriptTab';
import { SummaryTab } from '../modules/summary/SummaryTab';
import { RecordingPage } from '../modules/recording/RecordingPage';
import {
  resetPlayerForTests,
  setAudioElementFactoryForTests,
  usePlayerStore,
} from '../modules/audio/playerStore';
import { createFakeAudioElement } from '../../tests/helpers/fakeAudioElement';

let meeting: Meeting;

async function seedMeeting(): Promise<void> {
  meeting = await getRepositories().meetings.create({
    title: 'Rapat Koordinasi TKA SD',
    date: '2026-10-07',
  });
}

const budiSpeaker = {
  id: 'sp-budi',
  code: 'speaker_1',
  displayName: 'Budi',
  durationSeconds: 40,
  segmentCount: 5,
  createdAt: nowIso(),
  updatedAt: nowIso(),
};

function makeSegment(
  id: string,
  sequence: number,
  startTime: number,
  endTime: number,
  text: string,
): TranscriptSegment {
  return {
    id,
    meetingId: meeting.id,
    startTime,
    endTime,
    text,
    sequence,
    createdAt: nowIso(),
  };
}

async function seedTranscript(): Promise<TranscriptSegment[]> {
  const segments = [
    makeSegment('acc-1', 0, 0, 10, 'Selamat pagi. Kita mulai rapat evaluasi data semester ini.'),
    makeSegment('acc-2', 1, 10, 15, 'Apakah data NISN sudah diverifikasi?'),
    makeSegment(
      'acc-3',
      2,
      15,
      25,
      'Disepakati seluruh operator sekolah wajib menyerahkan rekap data.',
    ),
    makeSegment('acc-4', 3, 25, 30, 'Budi akan mengirimkan laporan paling lambat besok.'),
    makeSegment('acc-5', 4, 30, 40, 'Verifikasi data Korwil menunggu keputusan kepala bidang.'),
  ];
  await getRepositories().transcript.addSegments(segments);
  return segments;
}

async function seedChunk(): Promise<void> {
  await getRepositories().audioChunks.add({
    id: 'chunk-acc-1',
    meetingId: meeting.id,
    sequence: 1,
    localPath: audioChunkPath(meeting.id, 1),
    startTime: 0,
    endTime: 300,
    durationSeconds: 300,
    mimeType: 'audio/webm',
    uploadStatus: 'PENDING',
    transcriptionStatus: 'DONE',
    transcriptionAttempts: 1,
    createdAt: nowIso(),
  });
}

function renderRoute(path: string, element: React.ReactElement, routePath: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <RepositoriesProvider>
        <Routes>
          <Route path={routePath} element={element} />
        </Routes>
      </RepositoriesProvider>
    </MemoryRouter>,
  );
}

beforeEach(async () => {
  resetRepositories();
  resetPlayerForTests();
  setAudioElementFactoryForTests(() => createFakeAudioElement().element);
  useToastStore.setState({ message: null });
  await clearAllLocalData();
  await seedMeeting();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('§52 #1 — Pengguna dapat membuat rapat', () => {
  it('rapat tersimpan dengan status DRAFT dan muncul di daftar', async () => {
    const created = await getRepositories().meetings.create({
      title: 'Rapat Baru',
      date: '2026-10-08',
    });

    expect(created.status).toBe('DRAFT');
    const list = await getRepositories().meetings.list({ limit: 10 });
    expect(list.some((item) => item.title === 'Rapat Baru')).toBe(true);
  });
});

describe('§52 #2 — Pengguna dapat memulai recording', () => {
  it('halaman rekam siap merekam dan tombol berhenti terkunci di state idle', async () => {
    renderRoute(`/rapat/${meeting.id}/rekam`, <RecordingPage />, '/rapat/:meetingId/rekam');

    expect(await screen.findByRole('status')).toHaveTextContent('● SIAP MEREKAM');
    expect(screen.getByRole('button', { name: /■ SELESAI/ })).toBeDisabled();
    // Pemanggilan engine.start nyata membutuhkan MediaRecorder/mikrofon dan
    // diuji pada perangkat (uji otomatis Android = Batch 14); di lingkungan
    // tanpa dukungan, aplikasi jujur menampilkan ketidakmampuannya.
  });
});

describe('§52 #3 — Audio tetap direkam ketika layar dikunci', () => {
  it('chunk yang tertulis ke manifes pasca-crash dipulihkan utuh (setara web)', async () => {
    const db = createMemoryRepositories();
    const storage = new MemStorage();
    await storage.writeText(
      audioManifestPath(meeting.id),
      JSON.stringify({
        version: 1,
        meetingId: meeting.id,
        mimeType: 'audio/webm',
        chunkDurationSeconds: 300,
        updatedAt: nowIso(),
        chunks: [
          {
            sequence: 1,
            localPath: audioChunkPath(meeting.id, 1),
            startTime: 0,
            endTime: 300,
            byteSize: 4,
            mimeType: 'audio/webm',
          },
        ],
      }),
    );
    await storage.writeBlob(audioChunkPath(meeting.id, 1), new Blob(['data']));

    const report = await recoverMeeting(meeting.id, db.repositories, storage);

    expect(await db.repositories.audioChunks.listByMeeting(meeting.id)).toHaveLength(1);
    expect(report.adopted).toBe(1);
  });
});

describe('§52 #4 — Audio disimpan dalam chunk', () => {
  it('chunk tersimpan terpisah per urutan waktu', async () => {
    await seedChunk();

    const chunks = await getRepositories().audioChunks.listByMeeting(meeting.id);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.sequence).toBe(1);
    expect(chunks[0]?.durationSeconds).toBe(300);
    expect(chunks[0]?.localPath).toContain('/audio/');
  });
});

describe('§52 #5 — Rekaman tidak hilang ketika internet terputus', () => {
  it('chunk & transkrip tersimpan lokal tanpa satu pun panggilan jaringan', async () => {
    const fetchSpy = typeof globalThis.fetch === 'function' ? vi.spyOn(globalThis, 'fetch') : null;

    await seedChunk();
    await seedTranscript();

    expect(fetchSpy?.mock.calls.length ?? 0).toBe(0);
    expect(await getRepositories().audioChunks.listByMeeting(meeting.id)).toHaveLength(1);
    expect(await getRepositories().transcript.listByMeeting(meeting.id)).toHaveLength(5);
  });
});

describe('§52 #6 — Transkrip memiliki timestamp', () => {
  it('setiap segmen membawa waktu mulai & akhir dalam detik', async () => {
    const [segment] = await seedTranscript();

    expect(typeof segment?.startTime).toBe('number');
    expect(typeof segment?.endTime).toBe('number');
    expect(segment?.endTime).toBeGreaterThan(segment?.startTime ?? 0);
  });
});

describe('§52 #7 — Klik teks memutar audio dari posisi terkait', () => {
  it('men klik segmen → player melompat ke timestamp segmen', async () => {
    await seedTranscript();
    const storage = new MemStorage();
    await storage.writeBlob(audioChunkPath(meeting.id, 1), new Blob(['audio']));
    usePlayerStore.getState().attach({
      meetingId: meeting.id,
      chunks: [
        {
          id: 'chunk-acc-1',
          meetingId: meeting.id,
          sequence: 1,
          localPath: audioChunkPath(meeting.id, 1),
          startTime: 0,
          endTime: 300,
          durationSeconds: 300,
          mimeType: 'audio/webm',
          uploadStatus: 'PENDING',
          transcriptionStatus: 'DONE',
          transcriptionAttempts: 1,
          createdAt: nowIso(),
        },
      ],
      storage,
    });
    await getRepositories().meetings.update(meeting.id, { status: 'COMPLETED' });
    renderRoute(`/rapat/${meeting.id}/transkrip`, <TranscriptTab />, '/rapat/:meetingId/transkrip');

    fireEvent.click(await screen.findByRole('button', { name: /Selamat pagi/ }));

    await waitFor(() => expect(usePlayerStore.getState().currentTime).toBe(0));
    expect(usePlayerStore.getState().playing).toBe(true);
  });
});

describe('§52 #8 — Audio yang diputar menyorot teks terkait', () => {
  it('posisi play menentukan segmen aktif pada timeline', async () => {
    const segments = await seedTranscript();

    const active = findActiveSegment(segments, 20);
    expect(active?.id).toBe('acc-3');
    expect(findActiveSegment(segments, 999)).toBeNull();
  });
});

describe('§52 #9 — Pencarian kata dalam transkrip', () => {
  it('kata kunci ditemukan beserta posisi potongan teksnya', async () => {
    const segments = await seedTranscript();

    const hits = searchSegments(segments, 'NISN');
    expect(hits).toHaveLength(1);
    expect(hits[0]?.segment.id).toBe('acc-2');
    expect(hits[0]?.matchStart).toBeGreaterThanOrEqual(0);
  });
});

describe('§52 #10 — Sistem memisahkan pembicara', () => {
  it('segmen mengikuti giliran bicara pembicara yang mendominasi waktunya', async () => {
    const turns = [
      { startTime: 0, endTime: 20, speakerCode: 'speaker_1' },
      { startTime: 20, endTime: 45, speakerCode: 'speaker_2' },
    ];

    expect(pickSpeakerCodeForSegment({ startTime: 0, endTime: 10 }, turns)).toBe('speaker_1');
    expect(pickSpeakerCodeForSegment({ startTime: 25, endTime: 40 }, turns)).toBe('speaker_2');
  });
});

describe('§52 #11 — Pengguna mengganti nama pembicara', () => {
  it('rename tersimpan sebagai nama tampilan terbaru', async () => {
    await getRepositories().speakers.add({
      id: 'sp-acc',
      meetingId: meeting.id,
      code: 'speaker_1',
      displayName: 'Pembicara 1',
      durationSeconds: 40,
      segmentCount: 2,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });

    await getRepositories().speakers.rename('sp-acc', 'Bu Sari');

    const [speaker] = await getRepositories().speakers.listByMeeting(meeting.id);
    expect(speaker?.displayName).toBe('Bu Sari');
  });
});

describe('§52 #12 — AI menghasilkan ringkasan', () => {
  it('ringkasan terbentuk dari transkrip', async () => {
    const segments = await seedTranscript();

    const result = summarizeExtractive({
      meeting,
      segments,
      speakers: [],
      language: 'id',
    });

    expect(result.summary.length).toBeGreaterThan(0);
  });
});

describe('§52 #13 — AI menghasilkan keputusan', () => {
  it('kalimat "Disepakati…" menjadi keputusan bertimestamp sumber', async () => {
    const segments = await seedTranscript();

    const result = summarizeExtractive({
      meeting,
      segments,
      speakers: [{ ...budiSpeaker, meetingId: meeting.id }],
      language: 'id',
    });

    expect(result.decisions.length).toBeGreaterThan(0);
    expect(result.decisions[0]?.content).toContain('Disepakati');
    expect(result.decisions[0]?.sourceTimestamp).toBe(15);
  });
});

describe('§52 #14 — AI menghasilkan tindak lanjut', () => {
  it('kalimat "…akan mengirim…" menjadi tindak lanjut', async () => {
    const segments = await seedTranscript();

    const result = summarizeExtractive({
      meeting,
      segments,
      speakers: [{ ...budiSpeaker, meetingId: meeting.id }],
      language: 'id',
    });

    const item = result.actionItems.find((entry) => entry.task.includes('laporan'));
    expect(item).toBeDefined();
  });
});

describe('§52 #15 — AI mengidentifikasi PIC dan deadline', () => {
  it('tindak lanjut membawa PIC (Budi) dan deadline (besok)', async () => {
    const segments = await seedTranscript();

    const result = summarizeExtractive({
      meeting,
      segments,
      speakers: [{ ...budiSpeaker, meetingId: meeting.id }],
      language: 'id',
    });

    const item = result.actionItems.find((entry) => entry.task.includes('laporan'));
    expect(item?.assignee).toBe('Budi');
    expect(item?.deadline).toBe('besok');
  });
});

describe('§52 #16 — Pengguna dapat mengoreksi transkrip', () => {
  it('update segmen tersimpan sebagai versi terbaru (editedAt)', async () => {
    await seedTranscript();

    const updated = await getRepositories().transcript.updateSegment('acc-1', {
      text: 'Kalimat sudah dikoreksi pengguna.',
    });

    expect(updated.text).toBe('Kalimat sudah dikoreksi pengguna.');
    expect(updated.editedAt).toBeDefined();
  });
});

describe('§52 #17 — Pengguna dapat menghasilkan notulen', () => {
  it('notulen terbentuk dari ringkasan, keputusan, dan tindak lanjut', async () => {
    const segments = await seedTranscript();
    const ai = summarizeExtractive({
      meeting,
      segments,
      speakers: [{ ...budiSpeaker, meetingId: meeting.id }],
      language: 'id',
    });
    await getRepositories().summaries.save({
      id: 'sum-acc',
      meetingId: meeting.id,
      content: ai.summary,
      topics: ai.topics,
      undecided: ai.undecided,
      sourceSegmentIds: [],
      createdAt: nowIso(),
    });

    const minutes = generateMinutes({
      meeting,
      summary: await getRepositories().summaries.get(meeting.id),
      decisions: ai.decisions.map((decision) => ({
        id: createId(),
        meetingId: meeting.id,
        content: decision.content,
        sourceTimestamp: decision.sourceTimestamp,
        createdAt: nowIso(),
      })),
      actionItems: ai.actionItems.map((item) => ({
        id: createId(),
        meetingId: meeting.id,
        task: item.task,
        assignee: item.assignee,
        deadline: item.deadline,
        status: 'OPEN' as const,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      })),
    });

    expect(minutes.sections.length).toBeGreaterThan(0);
    expect(JSON.stringify(minutes.sections)).toContain('Disepakati');
  });
});

describe('§52 #18 — Notulen dapat diekspor', () => {
  it('provider ekspor lokal menghasilkan berkas nyata per format', async () => {
    const segments = await seedTranscript();
    const provider = getExportProvider();

    for (const format of ['PDF', 'DOCX', 'TXT', 'XLSX'] as const) {
      const request = buildExportRequest(format, {
        meeting,
        minutes: null,
        summary: null,
        segments,
        decisions: [],
        actionItems: [],
        speakers: [],
      });
      const result = await provider.export(request);
      expect(result.blob.size).toBeGreaterThan(0);
      expect(result.fileName).toMatch(/\.(pdf|docx|txt|xlsx)$/);
    }
  });
});

describe('§52 #19 — Pengguna dapat menghapus data rapat', () => {
  it('rapat & datanya hilang dari penyimpanan lokal', async () => {
    await seedTranscript();
    await seedChunk();

    await Promise.all([
      getRepositories().meetings.delete(meeting.id),
      removeMeetingFiles(meeting.id),
    ]);

    expect(await getRepositories().meetings.getById(meeting.id)).toBeNull();
    expect(await getRepositories().transcript.listByMeeting(meeting.id)).toHaveLength(0);
    expect(await getRepositories().audioChunks.listByMeeting(meeting.id)).toHaveLength(0);
  });
});

describe('§52 #20 — Kegagalan AI tidak menyebabkan audio hilang', () => {
  it('saat provider ringkasan gagal, transkrip & chunk tetap utuh', async () => {
    await seedTranscript();
    await seedChunk();
    vi.spyOn(ExtractiveAISummarizationProvider.prototype, 'summarize').mockRejectedValue(
      new AppError('AI_FAILED', 'AI sedang sibuk, coba lagi.'),
    );
    renderRoute(`/rapat/${meeting.id}/ringkasan`, <SummaryTab />, '/rapat/:meetingId/ringkasan');

    const button = await screen.findByRole('button', { name: /✨ Buat Ringkasan AI/ });
    // Tombol aktif setelah segmen dimuat (disabled={!canSummarize}).
    await waitFor(() => expect(button).toBeEnabled(), { timeout: 5000 });
    fireEvent.click(button);

    await waitFor(() => expect(useToastStore.getState().message).not.toBeNull(), {
      timeout: 5000,
    });
    expect(await getRepositories().summaries.get(meeting.id)).toBeNull();
    expect(await getRepositories().transcript.listByMeeting(meeting.id)).toHaveLength(5);
    expect(await getRepositories().audioChunks.listByMeeting(meeting.id)).toHaveLength(1);
  });
});
