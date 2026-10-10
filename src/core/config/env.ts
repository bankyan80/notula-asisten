/**
 * Konfigurasi aplikasi dari environment.
 * Aturan: tidak ada secret/API key di sini — hanya nilai publik VITE_*.
 */
import { z } from 'zod';

const envSchema = z.object({
  VITE_APP_NAME: z.string().min(1).default('Notula Assistent'),
  VITE_STORAGE_MODE: z.enum(['device', 'device_cloud']).default('device'),
  VITE_SPEECH_PROVIDER: z.string().min(1).default('whisper-web'),
  VITE_DIARIZATION_PROVIDER: z.string().min(1).default('vad-local'),
  VITE_AI_PROVIDER: z.string().min(1).default('extractive'),
  VITE_API_BASE_URL: z.string().default(''),
});

export type AppConfig = z.infer<typeof envSchema>;

function loadConfig(): AppConfig {
  const raw = import.meta.env as unknown as Record<string, string | undefined>;
  const parsed = envSchema.safeParse({
    VITE_APP_NAME: raw.VITE_APP_NAME,
    VITE_STORAGE_MODE: raw.VITE_STORAGE_MODE,
    VITE_SPEECH_PROVIDER: raw.VITE_SPEECH_PROVIDER,
    VITE_DIARIZATION_PROVIDER: raw.VITE_DIARIZATION_PROVIDER,
    VITE_AI_PROVIDER: raw.VITE_AI_PROVIDER,
    VITE_API_BASE_URL: raw.VITE_API_BASE_URL,
  });
  if (!parsed.success) {
    // Jangan crash di produksi karena .env salah — pakai default aman.
    console.error('Konfigurasi tidak valid, memakai default:', parsed.error.flatten());
    return envSchema.parse({});
  }
  return parsed.data;
}

export const config: AppConfig = loadConfig();

export const isCloudEnabled = (): boolean => config.VITE_STORAGE_MODE === 'device_cloud';
