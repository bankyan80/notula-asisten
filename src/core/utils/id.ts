/** ID unik untuk entity lokal. */
export function createId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback untuk lingkungan tanpa crypto.randomUUID
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
