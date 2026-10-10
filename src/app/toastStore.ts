/** Toast global (Zustand) — satu sumber untuk pesan singkat ke pengguna. */
import { create } from 'zustand';

interface ToastState {
  message: string | null;
  showToast: (message: string, durationMs?: number) => void;
  hideToast: () => void;
}

let timeoutId: ReturnType<typeof setTimeout> | undefined;

export const useToastStore = create<ToastState>((set) => ({
  message: null,
  showToast: (message, durationMs = 2600) => {
    if (timeoutId) clearTimeout(timeoutId);
    set({ message });
    timeoutId = setTimeout(() => {
      set({ message: null });
      timeoutId = undefined;
    }, durationMs);
  },
  hideToast: () => {
    if (timeoutId) clearTimeout(timeoutId);
    set({ message: null });
  },
}));
