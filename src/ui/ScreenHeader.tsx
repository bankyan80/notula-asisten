import { useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';

export interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  backTo?: string;
  right?: ReactNode;
}

export function ScreenHeader({
  title,
  subtitle,
  showBack = true,
  backTo,
  right,
}: ScreenHeaderProps) {
  const navigate = useNavigate();

  const handleBack = (): void => {
    if (backTo) {
      void navigate(backTo);
    } else {
      navigate(-1);
    }
  };

  return (
    <header className="sticky top-0 z-10 flex min-h-14 items-center gap-3 bg-white px-4 py-3">
      {showBack && (
        <button
          type="button"
          onClick={handleBack}
          aria-label="Kembali"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-2xl leading-none text-ink active:bg-surface"
        >
          ‹
        </button>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-xl font-bold text-ink">{title}</h1>
        {subtitle && <p className="truncate text-sm text-muted">{subtitle}</p>}
      </div>
      {right}
    </header>
  );
}
