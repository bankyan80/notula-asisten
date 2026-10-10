/**
 * Antrean tulis chunk rekaman — SATU rantai promise global yang diserialisasi.
 *
 * Kenapa perlu: `engine.stop()` selesai pada event `onstop`, tetapi chunk
 * terakhir baru saja masuk ke antrean tulis (manifest → file → DB) yang berjalan
 * ASINKRON. Tanpa cara menunggu antrean itu, antrian transkripsi membaca tabel
 * chunk sebelum barisnya ada → "tidak ada pekerjaan" → rapat tersangkut.
 *
 * Pemakaian:
 * - `useChunkPersistence` mendaftarkan setiap tulis lewat `enqueueChunkWrite`.
 * - `stopRecordingSafely` & `runPipeline` memanggil `waitForChunkWrites()`
 *   sebelum membaca/memproses audio.
 *
 * Kunci anti-deadlock: pemanggil yang berjalan DI DALAM rantai ini (handler
 * storage penuh) TIDAK boleh menunggu rantai yang sama — lewati lewat
 * `withChunkWriteWaitSkipped`. Pemanggil dari UI (tombol SELESAI) tetap menunggu.
 */
let chain: Promise<void> = Promise.resolve();

/** Berapa banyak pemanggil sedang berada di dalam rantai tulis. */
let insideWriteDepth = 0;

/** Daftarkan satu pekerjaan tulis — dieksekusi berurutan setelah yang sebelumnya. */
export function enqueueChunkWrite(task: () => Promise<void>): void {
  chain = chain.then(task).catch(() => undefined);
}

/**
 * Tunggu sampai SEMUA tulis yang sudah terdaftar selesai.
 * Bila dipanggil dari dalam rantai tuli, langsung lanjut (mencegah deadlock).
 */
export async function waitForChunkWrites(): Promise<void> {
  if (insideWriteDepth > 0) return;
  await chain;
}

/**
 * Jalankan `fn` sambil menandai bahwa kita berada DI DALAM rantai tulis —
 * `waitForChunkWrites()` di dalam `fn` tidak akan menunggu dirinya sendiri.
 */
export function withChunkWriteWaitSkipped<T>(fn: () => Promise<T>): Promise<T> {
  insideWriteDepth += 1;
  return fn().finally(() => {
    insideWriteDepth -= 1;
  });
}

/**
 * Seperti `waitForChunkWrites()`, tetapi aman dipanggil dari dalam rantai tulis:
 * menunggu sampai rantai benar-benar kering (tanpa siklus), lalu menunggu
 * seluruh tulis yang sudah terdaftar. Dipakai pipeline (`executePipeline`)
 * yang tidak ditunggu oleh rantai itu sendiri.
 */
export async function drainChunkWrites(): Promise<void> {
  while (insideWriteDepth > 0) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  await waitForChunkWrites();
}

/** Hanya untuk test: kembalikan rantai ke keadaan kosong. */
export function resetChunkWriteChainForTests(): void {
  chain = Promise.resolve();
  insideWriteDepth = 0;
}
