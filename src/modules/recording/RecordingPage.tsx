import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AppError, friendlyMessage } from '../../core/errors/AppError';
import { useAsync } from '../../core/hooks/useAsync';
import { useRepositories } from '../../app/useRepositories';
import { useToastStore } from '../../app/toastStore';
import { getRecordingEngine } from '../../providers';
import type { RecordingState } from '../../core/types/providers';
import { formatClock } from '../../core/utils/time';
import { useSettingsStore } from '../settings/settingsStore';
import { evaluateStorage, getDeviceStorage, requiredBytesFor } from '../storage/estimate';
import { Button, ScreenHeader } from '../../ui';
import { startNativeRecordingService, stopNativeRecordingService } from './nativeService';
import { describeRecordingFailure, describeUnsupportedEngine } from './recordingDiagnostics';
import { stopRecordingSafely } from './stopRecording';

const STATUS_LABEL: Record<RecordingState['status'], string> = {
  idle: '● SIAP MEREKAM',
  requesting_permission: '● MEMINTA IZIN MIKROFON',
  recording: '🔴 SEDANG MEREKAM',
  paused: '● REKAMAN DIJEDA',
  stopping: '● MENGHENTIKAN…',
  stopped: '✓ REKAMAN SELESAI',
  error: '⚠ REKAMAN BERMASALAH',
};

export function RecordingPage() {
  const { meetingId = '' } = useParams();
  const navigate = useNavigate();
  const repositories = useRepositories();
  const showToast = useToastStore((state) => state.showToast);
  const language = useSettingsStore((state) => state.language);
  const consentAccepted = useSettingsStore((state) => state.consentAccepted);

  const engine = useMemo(() => getRecordingEngine(), []);
  const supported = useMemo(() => engine.isSupported(), [engine]);

  const { data: meeting, reload: reloadMeeting } = useAsync(
    () => repositories.meetings.getById(meetingId),
    [repositories, meetingId],
  );
  const { data: storage } = useAsync(getDeviceStorage, []);

  const [state, setState] = useState<RecordingState>(() => engine.getState());
  useEffect(() => engine.onStateChange((next) => setState(next)), [engine]);

  const storageLevel = evaluateStorage(
    storage ?? { availableBytes: null, isEstimated: true },
    requiredBytesFor(600),
  );

  const handle = async (action: () => Promise<unknown>): Promise<void> => {
    try {
      await action();
    } catch (error) {
      // Penyebab spesifik (izin ditolak, mic sibuk, bukan https…) selalu
      // diprioritaskan; hanya kegagalan tanpa diagnosa yang memakai pesan umum.
      showToast(describeRecordingFailure(error) ?? friendlyMessage(error));
    }
  };

  const recording = state.status === 'recording';
  const paused = state.status === 'paused';
  const canControl = recording || paused;

  return (
    <div className="flex min-h-dvh flex-col bg-surface">
      <ScreenHeader title={meeting?.title ?? 'Rekam Rapat'} backTo="/rapat" />

      <main className="flex flex-1 flex-col items-center justify-center px-5 pb-10">
        {/* Status indicator */}
        <div className="mb-4" role="status">
          <p className={`text-lg font-bold ${recording ? 'text-danger' : 'text-muted'}`}>
            {STATUS_LABEL[state.status]}
          </p>
        </div>

        {/* Big timer */}
        <p className="font-mono text-6xl font-extrabold tracking-wider text-ink">
          {formatClock(state.elapsedSeconds)}
        </p>

        {/* Waveform */}
        <div className="my-10 flex h-24 w-full max-w-xs items-center justify-center gap-1.5 overflow-hidden">
          {supported && recording ? (
            Array.from({ length: 24 }, (_, index) => (
              <span
                key={index}
                className="w-1.5 animate-pulse rounded-full bg-brand"
                style={{ height: `${20 + ((index * 37) % 60)}%` }}
              />
            ))
          ) : (
            <div className="h-px w-full bg-line" />
          )}
        </div>

        {/* Controls */}
        <div className="flex w-full max-w-xs gap-3">
          <Button
            variant="secondary"
            className="flex-1"
            disabled={!supported || !canControl}
            onClick={() =>
              void handle(async () => {
                if (paused) await engine.resume();
                else await engine.pause();
              })
            }
          >
            {paused ? '▶ Lanjut' : '⏸ Jeda'}
          </Button>
          <Button
            variant="danger"
            className="flex-1"
            disabled={!supported || !canControl}
            onClick={() =>
              void handle(async () => {
                const result = await stopRecordingSafely(engine, repositories, meetingId);
                await stopNativeRecordingService();
                reloadMeeting();
                if (result) {
                  showToast(
                    `Rekaman selesai — ${result.chunkCount} chunk, ${formatClock(result.totalDurationSeconds)}.`,
                  );
                  // Lanjut ke Transkrip: pengguna melihat proses transkripsi →
                  // ringkasan → notulen berjalan otomatis di layar itu.
                  navigate(`/rapat/${meetingId}/transkrip`, { replace: true });
                }
              })
            }
          >
            ■ SELESAI
          </Button>
        </div>

        {/* Start button (when idle) */}
        {supported && !canControl && (
          <Button
            block
            className="mt-4 max-w-xs"
            disabled={!consentAccepted}
            onClick={() =>
              void handle(async () => {
                if (storageLevel === 'insufficient') {
                  throw new AppError(
                    'STORAGE_FULL',
                    'Penyimpanan perangkat tidak cukup untuk memulai rekaman.',
                  );
                }
                await engine.start({ meetingId, language, chunkDurationSeconds: 300 });
                await startNativeRecordingService();
                await repositories.meetings.update(meetingId, {
                  status: 'RECORDING',
                  startTime: new Date().toISOString(),
                });
                reloadMeeting();
              })
            }
          >
            🎙 MULAI REKAM
          </Button>
        )}

        {!supported && (
          <div className="mt-4 max-w-xs text-center">
            <p role="alert" className="text-sm leading-relaxed text-danger">
              {describeUnsupportedEngine()}
            </p>
            <p className="mt-2 text-sm text-muted">Mic: belum aktif</p>
          </div>
        )}

        {/* Small info line when recording */}
        {canControl && (
          <p className="mt-6 text-center text-sm text-muted">
            Rekaman tetap berjalan saat layar dikunci.
          </p>
        )}

        {/* Consent (only when not yet accepted) */}
        {!consentAccepted && (
          <section aria-label="Pemberitahuan rekaman" className="mt-6 max-w-xs">
            <p className="text-base font-semibold text-ink">📢 Pemberitahuan Rekaman</p>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Pastikan seluruh peserta mengetahui dan menyetujui perekaman.
            </p>
            <label className="mt-3 flex items-start gap-3 text-base text-ink">
              <input
                type="checkbox"
                checked={consentAccepted}
                onChange={(event) =>
                  useSettingsStore.getState().setConsentAccepted(event.target.checked)
                }
                className="mt-1 h-5 w-5 accent-brand"
              />
              Saya memastikan seluruh peserta menyetujui perekaman.
            </label>
          </section>
        )}
      </main>
    </div>
  );
}
