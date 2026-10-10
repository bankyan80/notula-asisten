import type { ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  block?: boolean;
  loading?: boolean;
  children: ReactNode;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-brand text-white active:bg-brand-secondary disabled:bg-brand/40',
  secondary: 'bg-light text-brand active:bg-brand/10',
  danger: 'bg-danger text-white active:bg-danger/85 disabled:bg-danger/40',
  ghost: 'bg-transparent text-brand active:bg-brand/10',
};

export function Button({
  variant = 'primary',
  block = false,
  loading = false,
  disabled,
  className = '',
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl px-6 py-3.5 text-base font-semibold transition disabled:cursor-not-allowed disabled:opacity-70 ${
        VARIANT_CLASSES[variant]
      } ${block ? 'w-full' : ''} ${className}`}
      {...rest}
    >
      {loading && (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      )}
      {children}
    </button>
  );
}
