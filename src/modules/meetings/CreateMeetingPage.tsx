import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { createMeetingSchema } from '../../core/validation/schemas';
import { useAsync } from '../../core/hooks/useAsync';
import { useRepositories } from '../../app/useRepositories';
import { useToastStore } from '../../app/toastStore';
import { Button, ScreenHeader, TextField } from '../../ui';
import { useSettingsStore } from '../settings/settingsStore';
import { evaluateStorage, getDeviceStorage, requiredBytesFor } from '../storage/estimate';

const TWO_HOURS = 7200;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function CreateMeetingPage() {
  const repositories = useRepositories();
  const navigate = useNavigate();
  const showToast = useToastStore((state) => state.showToast);
  const consentAccepted = useSettingsStore((state) => state.consentAccepted);
  const setConsentAccepted = useSettingsStore((state) => state.setConsentAccepted);

  const [title, setTitle] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: storage } = useAsync(getDeviceStorage, []);
  const storageLevel = evaluateStorage(
    storage ?? { availableBytes: null, isEstimated: true },
    requiredBytesFor(TWO_HOURS),
  );
  const canSubmit = consentAccepted && storageLevel !== 'insufficient';

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const parsed = createMeetingSchema.safeParse({
      title,
      date: todayIso(),
      language: 'id',
      minutesTemplateId: 'umum',
    });

    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? 'form');
        if (!fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      showToast('Periksa kembali isian formulir.');
      return;
    }

    setErrors({});
    try {
      const meeting = await repositories.meetings.create(parsed.data);
      showToast('Rapat dibuat. Siap merekam.');
      void navigate(`/rapat/${meeting.id}/rekam`);
    } catch {
      showToast('Gagal menyimpan rapat. Coba lagi.');
    }
  };

  return (
    <div className="min-h-dvh bg-surface">
      <ScreenHeader title="Mulai Rapat" backTo="/" />

      <main className="px-5 pb-8 pt-4">
        <form onSubmit={(event) => void handleSubmit(event)} noValidate>
          <TextField
            fieldId="title"
            label="Judul Rapat"
            placeholder="Rapat Koordinasi TKA SD"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            error={errors.title}
            required
          />

          <section aria-label="Pemberitahuan rekaman" className="mt-2 mb-6">
            <label className="flex items-start gap-3 text-base text-ink">
              <input
                type="checkbox"
                checked={consentAccepted}
                onChange={(event) => setConsentAccepted(event.target.checked)}
                className="mt-1 h-5 w-5 accent-brand"
              />
              <span>Saya memastikan seluruh peserta menyetujui perekaman.</span>
            </label>
            {!consentAccepted && (
              <p className="mt-2 text-sm text-muted">Centang persetujuan untuk melanjutkan.</p>
            )}
          </section>

          <Button type="submit" block disabled={!canSubmit}>
            🎙 MULAI REKAM
          </Button>
        </form>
      </main>
    </div>
  );
}
