import type { ReactNode } from 'react';

export interface ChipProps {
  tone?: 'neutral' | 'success' | 'danger' | 'warning' | 'brand';
  children: ReactNode;
}

const TONES: Record<NonNullable<ChipProps['tone']>, string> = {
  neutral: 'bg-slate-100 text-slate-600',
  success: 'bg-success/10 text-success',
  danger: 'bg-danger/10 text-danger',
  warning: 'bg-amber-100 text-amber-700',
  brand: 'bg-brand/10 text-brand',
};

export function Chip({ tone = 'neutral', children }: ChipProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}
