/**
 * Player audio lintas-chunk (Batch 07) — SATU state untuk seluruh UI.
 *
 * - Sumber kebenaran posisi pemutaran ada di store ini; Transkrip, bar player,
 *   dan hasil pencarian hanya membaca/memanggil aksi yang sama (PRD §12).
 * - File per chunk (Batch 05): seek memetakan detik timeline → chunk yang
 *   membawahi → baca blob → putar dengan offset di dalam file chunk itu.
 * - HTMLAudioElement dibuat di luar React (singleton); event `timeupdate` dsb.
 *   memperbarui store lewat `usePlayerStore.setState` — bukan setState React,
 *   sehingga aman terhadap aturan `react-hooks/set-state-in-effect`.
 * - Factory elemen bisa ditukar di test (jsdom tidak memutar audio sungguhan).
 */
import { create } from 'zustand';
import type { AudioChunk } from '../../core/types/entities';
import type { StorageProvider } from '../../core/types/providers';
import { getStorageProvider } from '../../providers';
import { buildChunkTimeline, resolveChunkAt, findNextChunk, type ChunkSpan } from './timeline';

interface AttachInput {
  meetingId: string;
  chunks: AudioChunk[];
  /** Untuk test — default: registry storage aplikasi (OPFS). */
  storage?: StorageProvider;
}

interface PlayerState {
  meetingId: string | null;
  timeline: ChunkSpan[];
  /** Durasi total = akhir chunk terakhir. */
  duration: number;
  /** Posisi dalam TIMELINE meeting (detik) — bukan waktu file chunk. */
  currentTime: number;
  playing: boolean;
  loading: boolean;
  /** Pesan ramah (PRD §29) bila audio gagal dimuat/diputar. */
  error: string | null;
  attach(input: AttachInput): void;
  detach(): void;
  /** Klik teks / hasil cari / tombol putar → lompat & putar (PRD §12.1). */
  playFrom(seconds: number): Promise<void>;
  toggle(): Promise<void>;
  /** Geser slider: putar-terus bila sedang berjalan, tanpa auto-play bila jeda. */
  seek(seconds: number): void;
  pause(): void;
}

const INITIAL = {
  meetingId: null,
  timeline: [] as ChunkSpan[],
  duration: 0,
  currentTime: 0,
  playing: false,
  loading: false,
  error: null,
} satisfies Pick<
  PlayerState,
  'meetingId' | 'timeline' | 'duration' | 'currentTime' | 'playing' | 'loading' | 'error'
>;

let audio: HTMLAudioElement | null = null;
let elementFactory: (() => HTMLAudioElement) | null = null;
let objectUrl: string | null = null;
let currentPath: string | null = null;
let storage: StorageProvider | null = null;
/** Token anti-siap-berlomba: klik cepat-ganda tidak boleh menukar src di tengah jalan. */
let loadToken = 0;

/** Ganti elemen audio (test). `null` kembali ke `new Audio()`. */
export function setAudioElementFactoryForTests(factory: (() => HTMLAudioElement) | null): void {
  elementFactory = factory;
}

function teardownAudio(): void {
  loadToken += 1;
  if (audio !== null) {
    audio.pause();
    audio.removeAttribute('src');
    audio = null; // elemen dibuang: play berikutnya membuat elemen (dan listener) baru
  }
  if (objectUrl !== null) URL.revokeObjectURL(objectUrl);
  objectUrl = null;
  currentPath = null;
}

function getAudio(): HTMLAudioElement {
  if (audio !== null) return audio;
  audio = elementFactory !== null ? elementFactory() : new Audio();
  audio.addEventListener('timeupdate', () => {
    if (audio !== null) usePlayerStore.setState({ currentTime: audio.currentTime });
  });
  audio.addEventListener('play', () => usePlayerStore.setState({ playing: true }));
  audio.addEventListener('pause', () => usePlayerStore.setState({ playing: false }));
  audio.addEventListener('ended', () => {
    void advanceToNextChunk();
  });
  audio.addEventListener('error', () => {
    usePlayerStore.setState({
      playing: false,
      loading: false,
      error: 'Audio tidak dapat diputar — file mungkin belum ada di perangkat.',
    });
  });
  return audio;
}

/** File chunk habis → lanjut chunk berikutnya (rekaman utuh lintas file). */
async function advanceToNextChunk(): Promise<void> {
  const state = usePlayerStore.getState();
  const next = findNextChunk(state.timeline, state.currentTime);
  if (next === null) {
    usePlayerStore.setState({ playing: false });
    return;
  }
  await state.playFrom(next.start);
}

async function loadAndPlay(span: ChunkSpan, offsetInChunk: number): Promise<void> {
  const token = ++loadToken;
  const element = getAudio();
  usePlayerStore.setState({ loading: true, error: null });

  if (currentPath !== span.localPath) {
    let blob: Blob;
    try {
      blob = await (storage ?? getStorageProvider()).readBlob(span.localPath);
    } catch {
      if (token === loadToken) {
        usePlayerStore.setState({
          loading: false,
          playing: false,
          error: 'Audio rapat tidak dapat dimuat dari perangkat.',
        });
      }
      return;
    }
    if (token !== loadToken) return;
    const nextUrl = URL.createObjectURL(blob);
    if (objectUrl !== null) URL.revokeObjectURL(objectUrl);
    objectUrl = nextUrl;
    currentPath = span.localPath;
    element.src = nextUrl;
  }

  element.currentTime = offsetInChunk;
  try {
    await element.play();
  } catch {
    if (token === loadToken) {
      usePlayerStore.setState({
        loading: false,
        playing: false,
        error: 'Browser menolak memutar audio. Ketuk tombol putar lagi.',
      });
    }
    return;
  }
  if (token !== loadToken) return;
  usePlayerStore.setState({
    loading: false,
    playing: true,
    currentTime: span.start + offsetInChunk,
    error: null,
  });
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  ...INITIAL,

  attach(input) {
    const switching = get().meetingId !== input.meetingId;
    if (switching) teardownAudio();
    storage = input.storage ?? null;
    const timeline = buildChunkTimeline(input.chunks);
    const duration = timeline.length > 0 ? (timeline[timeline.length - 1]?.end ?? 0) : 0;
    set(
      switching
        ? {
            meetingId: input.meetingId,
            timeline,
            duration,
            currentTime: 0,
            playing: false,
            loading: false,
            error: null,
          }
        : { meetingId: input.meetingId, timeline, duration },
    );
  },

  detach() {
    teardownAudio();
    storage = null;
    set({ ...INITIAL });
  },

  async playFrom(seconds) {
    const state = usePlayerStore.getState();
    if (state.timeline.length === 0) return; // audio belum ada → tidak mengarang error
    const span = resolveChunkAt(state.timeline, seconds);
    if (span === null) return;
    const offset = Math.max(0, Math.min(seconds - span.start, Math.max(0, span.end - span.start)));
    await loadAndPlay(span, offset);
  },

  async toggle() {
    const state = get();
    if (state.playing) {
      state.pause();
      return;
    }
    await state.playFrom(state.currentTime);
  },

  seek(seconds) {
    const state = get();
    if (state.timeline.length === 0) return;
    const clamped = Math.max(0, Math.min(seconds, state.duration));
    if (state.playing) {
      void state.playFrom(clamped);
      return;
    }
    const span = resolveChunkAt(state.timeline, clamped);
    set({ currentTime: clamped, error: null });
    if (span !== null && audio !== null && currentPath === span.localPath && audio.src !== '') {
      audio.currentTime = Math.max(0, clamped - span.start);
    }
  },

  pause() {
    loadToken += 1; // batal muat yang masih berjalan
    audio?.pause();
    set({ playing: false, loading: false });
  },
}));

/** Test-only: kembalikan store + elemen ke kondisi awal antar test. */
export function resetPlayerForTests(): void {
  teardownAudio();
  storage = null;
  usePlayerStore.setState({ ...INITIAL });
}
