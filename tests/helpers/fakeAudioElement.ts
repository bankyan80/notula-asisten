/**
 * HTMLAudioElement palsu untuk unit test (jsdom tidak memutar audio).
 * Meniru event penting yang dipakai playerStore: play/pause/ended/error/timeupdate.
 */
type Listener = () => void;

export interface FakeAudioElement {
  element: HTMLAudioElement;
  /** File src terakhir yang dibaca test (blob: URL hasil stub). */
  src: string;
  currentTime: number;
  paused: boolean;
  /** Event `ended` buatan — simulasi file chunk habis. */
  emitEnded(): void;
  /** Event `timeupdate` buatan dengan posisi tertentu. */
  emitTimeUpdate(time: number): void;
}

export function createFakeAudioElement(): FakeAudioElement {
  const listeners = new Map<string, Set<Listener>>();
  let src = '';
  let currentTime = 0;
  let paused = true;

  const emit = (type: string): void => {
    for (const listener of listeners.get(type) ?? []) listener();
  };

  const fake = {
    get src() {
      return src;
    },
    set src(value: string) {
      src = value;
    },
    get currentTime() {
      return currentTime;
    },
    set currentTime(value: number) {
      currentTime = value;
    },
    get paused() {
      return paused;
    },
    addEventListener(type: string, listener: Listener): void {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)?.add(listener);
    },
    removeEventListener(type: string, listener: Listener): void {
      listeners.get(type)?.delete(listener);
    },
    removeAttribute(name: string): void {
      if (name === 'src') src = '';
    },
    async play(): Promise<void> {
      paused = false;
      emit('play');
    },
    pause(): void {
      if (paused) return;
      paused = true;
      emit('pause');
    },
  };

  const element = fake as unknown as HTMLAudioElement;

  return {
    element,
    get src() {
      return src;
    },
    get currentTime() {
      return currentTime;
    },
    get paused() {
      return paused;
    },
    emitEnded(): void {
      paused = true;
      emit('pause');
      emit('ended');
    },
    emitTimeUpdate(time: number): void {
      currentTime = time;
      emit('timeupdate');
    },
  };
}
