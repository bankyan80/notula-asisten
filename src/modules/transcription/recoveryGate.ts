/**
 * Gerbang urutan: transkripsi (Batch 06) hanya boleh berjalan SETELAH
 * pemulihan chunk (Batch 05) selesai — recovery mengadopsi/membersihkan
 * metadata chunk, antrian membaca metadata yang sama.
 *
 * Sinyal disimpan di module state agar urutan tetap pasti walau efek React
 * dievaluasi dalam satu commit (flag dicek saat daftar, bukan hanya event).
 */
let settled = false;
const callbacks = new Set<() => void>();

export function markRecoverySettled(): void {
  if (settled) return;
  settled = true;
  for (const callback of callbacks) callback();
  callbacks.clear();
}

export function isRecoverySettled(): boolean {
  return settled;
}

/** Daftarkan callback; langsung dijalankan (microtask) bila recovery sudah selesai. */
export function onRecoverySettled(callback: () => void): () => void {
  if (settled) {
    queueMicrotask(callback);
    return () => undefined;
  }
  callbacks.add(callback);
  return () => {
    callbacks.delete(callback);
  };
}
