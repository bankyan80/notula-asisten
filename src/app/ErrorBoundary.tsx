import { Component, type ErrorInfo, type ReactNode } from 'react';
import { friendlyMessage, toAppError, type AppError } from '../core/errors/AppError';
import { createLogger } from '../core/logging/logger';

const logger = createLogger('error-boundary');

interface ErrorFallbackProps {
  error: AppError;
  onReset: () => void;
}

export function ErrorFallback({ error, onReset }: ErrorFallbackProps): ReactNode {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-surface px-6 text-center">
      <div className="w-full max-w-sm rounded-3xl border border-line bg-white p-6 shadow-lg">
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-danger/10 text-2xl">
          ⚠️
        </div>
        <h1 className="text-lg font-bold text-ink">Terjadi kesalahan</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">{friendlyMessage(error)}</p>
        <p className="mt-3 break-words rounded-xl bg-surface px-3 py-2 font-mono text-[11px] text-muted">
          {error.code}
        </p>
        <button
          type="button"
          onClick={onReset}
          className="mt-5 w-full rounded-2xl bg-brand px-4 py-3 text-sm font-semibold text-white active:bg-brand-secondary"
        >
          Coba Lagi
        </button>
      </div>
    </div>
  );
}

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: (props: ErrorFallbackProps) => ReactNode;
}

interface ErrorBoundaryState {
  error: unknown | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    const appError = toAppError(error);
    logger.error('Unhandled error di UI', appError, {
      componentStack: info.componentStack ?? '',
    });
  }

  private readonly handleReset = (): void => {
    this.setState({ error: null });
  };

  override render(): ReactNode {
    const { error } = this.state;
    if (error !== null) {
      const appError = toAppError(error);
      const fallback = this.props.fallback;
      if (fallback) return fallback({ error: appError, onReset: this.handleReset });
      return <ErrorFallback error={appError} onReset={this.handleReset} />;
    }
    return this.props.children;
  }
}
