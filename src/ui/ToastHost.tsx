import { useToastStore } from '../app/toastStore';

export function ToastHost() {
  const message = useToastStore((state) => state.message);
  if (!message) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed bottom-20 left-1/2 z-40 w-[min(90%,420px)] -translate-x-1/2 rounded-2xl bg-ink px-4 py-3 text-center text-xs font-medium text-white shadow-lg"
    >
      {message}
    </div>
  );
}
