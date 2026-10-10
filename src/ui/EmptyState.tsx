import type { ReactNode } from 'react';

export interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  children?: ReactNode;
}

export function EmptyState({
  icon = '📭',
  title,
  description,
  actionLabel,
  onAction,
  children,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center px-4 py-12 text-center">
      <div className="mb-4 text-4xl">{icon}</div>
      <h3 className="text-lg font-bold text-ink">{title}</h3>
      {description && (
        <p className="mt-2 max-w-xs text-base leading-relaxed text-muted">{description}</p>
      )}
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-5 rounded-2xl bg-brand px-6 py-3 text-base font-semibold text-white active:bg-brand-secondary"
        >
          {actionLabel}
        </button>
      )}
      {children}
    </div>
  );
}
