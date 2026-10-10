import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAsync } from '../../core/hooks/useAsync';
import { useRepositories } from '../../app/useRepositories';
import { useToastStore } from '../../app/toastStore';
import { createId } from '../../core/utils/id';
import { formatMinutesSeconds, nowIso, percentage } from '../../core/utils/time';
import { Button, Card, EmptyState } from '../../ui';

export function SpeakersTab() {
  const { meetingId = '' } = useParams();
  const repositories = useRepositories();
  const showToast = useToastStore((state) => state.showToast);

  const {
    data: speakers,
    loading,
    reload,
  } = useAsync(() => repositories.speakers.listByMeeting(meetingId), [repositories, meetingId]);
  const { data: meeting } = useAsync(
    () => repositories.meetings.getById(meetingId),
    [repositories, meetingId],
  );

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');

  const totalSpeaking =
    speakers?.reduce((sum, speaker) => sum + speaker.durationSeconds, 0) ??
    meeting?.durationSeconds ??
    0;

  const startEdit = (id: string, current: string): void => {
    setEditingId(id);
    setDraftName(current);
  };

  const saveEdit = async (): Promise<void> => {
    if (!editingId || draftName.trim() === '') return;
    try {
      await repositories.speakers.rename(editingId, draftName.trim());
      setEditingId(null);
      reload();
      showToast('Nama pembicara diperbarui.');
    } catch {
      showToast('Gagal memperbarui nama pembicara.');
    }
  };

  const addSpeaker = async (): Promise<void> => {
    const nextNumber = (speakers?.length ?? 0) + 1;
    try {
      await repositories.speakers.add({
        id: createId(),
        meetingId,
        code: `speaker_${nextNumber}`,
        displayName: `Pembicara ${nextNumber}`,
        durationSeconds: 0,
        segmentCount: 0,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });
      reload();
      showToast('Pembicara ditambahkan.');
    } catch {
      showToast('Gagal menambahkan pembicara.');
    }
  };

  return (
    <div>
      <Card className="mb-3">
        <p className="text-xs leading-relaxed text-muted">
          Pembicara dipisahkan berdasarkan suara, bukan identitas otomatis. Ubah nama agar sesuai
          peran sebenarnya di rapat.
        </p>
      </Card>

      <Card className="p-3">
        {loading && <p className="py-6 text-center text-xs text-muted">Memuat pembicara…</p>}

        {!loading && speakers && speakers.length === 0 && (
          <EmptyState
            icon="👥"
            title="Belum ada pembicara"
            description="Daftar pembicara beserta durasi bicara muncul setelah transkripsi dan diarization selesai."
          />
        )}

        {speakers?.map((speaker) => (
          <div
            key={speaker.id}
            className="flex items-center gap-3 border-b border-line py-3 last:border-b-0"
          >
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand text-xs font-bold text-white">
              {speaker.displayName.slice(-1)}
            </div>
            <div className="min-w-0 flex-1">
              {editingId === speaker.id ? (
                <div className="flex gap-2">
                  <input
                    autoFocus
                    value={draftName}
                    onChange={(event) => setDraftName(event.target.value)}
                    className="min-w-0 flex-1 rounded-xl border border-line px-2 py-1.5 text-sm outline-none focus:border-brand"
                    aria-label="Nama pembicara baru"
                  />
                  <Button onClick={() => void saveEdit()}>Simpan</Button>
                </div>
              ) : (
                <>
                  <h4 className="text-sm font-semibold text-ink">{speaker.displayName}</h4>
                  <p className="text-xs text-muted">
                    Durasi {formatMinutesSeconds(speaker.durationSeconds)} •{' '}
                    {percentage(speaker.durationSeconds, totalSpeaking)}% • {speaker.segmentCount}{' '}
                    segmen
                  </p>
                </>
              )}
            </div>
            {editingId !== speaker.id && (
              <button
                type="button"
                onClick={() => startEdit(speaker.id, speaker.displayName)}
                aria-label={`Ubah nama ${speaker.displayName}`}
                className="rounded-xl px-2 py-1 text-sm text-brand active:bg-brand/10"
              >
                ✏️
              </button>
            )}
          </div>
        ))}
      </Card>

      <Button variant="secondary" block className="mt-3" onClick={() => void addSpeaker()}>
        ＋ Tambah Pembicara
      </Button>
    </div>
  );
}
