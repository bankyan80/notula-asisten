/**
 * Jembatan ke foreground service Android (PRD §7/§28) — audio tetap terekam
 * saat layar dikunci. Pada browser (PWA/web) plugin ini tidak tersedia →
 * NO-OP jujur: rekaman tetap berjalan selama tab aktif (batasan browser
 * ditampilkan di UI, PRD §5.2).
 */
import { Capacitor, registerPlugin } from '@capacitor/core';

interface RecordingServicePlugin {
  start(): Promise<{ started: boolean }>;
  stop(): Promise<{ stopped: boolean }>;
}

const nativeService = registerPlugin<RecordingServicePlugin>('RecordingService');

export function isNativeRecordingServiceAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('RecordingService');
}

/** Mulai foreground service bila berjalan di build Android; false = tidak ada (web). */
export async function startNativeRecordingService(): Promise<boolean> {
  if (!isNativeRecordingServiceAvailable()) return false;
  try {
    const result = await nativeService.start();
    return result.started;
  } catch {
    return false; // layanan gagal → rekaman web tetap jalan; tidak melempar
  }
}

/** Hentikan foreground service; false = tidak ada (web) atau gagal (jujur). */
export async function stopNativeRecordingService(): Promise<boolean> {
  if (!isNativeRecordingServiceAvailable()) return false;
  try {
    const result = await nativeService.stop();
    return result.stopped;
  } catch {
    return false;
  }
}
