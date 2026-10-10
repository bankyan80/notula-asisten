import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ErrorBoundary, ErrorFallback } from './ErrorBoundary';
import { AppError } from '../core/errors/AppError';

function Boom(): React.JSX.Element {
  throw new Error('komponen rusak');
}

describe('ErrorBoundary', () => {
  it('menangkap error dan menampilkan fallback default', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );

    expect(screen.getByRole('heading', { name: 'Terjadi kesalahan' })).toBeInTheDocument();
    expect(screen.getByText('Coba Lagi')).toBeInTheDocument();

    consoleError.mockRestore();
  });

  it('tombol coba lagi memulihkan render setelah error mereda', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let shouldThrow = true;

    function Flaky(): React.JSX.Element {
      if (shouldThrow) throw new Error('sekali gagal');
      return <p>Render berhasil</p>;
    }

    render(
      <ErrorBoundary>
        <Flaky />
      </ErrorBoundary>,
    );

    shouldThrow = false;
    fireEvent.click(screen.getByText('Coba Lagi'));

    expect(screen.getByText('Render berhasil')).toBeInTheDocument();

    consoleError.mockRestore();
  });

  it('mendukung fallback kustom', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    render(
      <ErrorBoundary fallback={({ error }) => <p>Kustom: {error.code}</p>}>
        <Boom />
      </ErrorBoundary>,
    );

    expect(screen.getByText(/^Kustom: UNKNOWN$/)).toBeInTheDocument();

    consoleError.mockRestore();
  });
});

describe('ErrorFallback', () => {
  it('menampilkan pesan ramah sesuai kode error', () => {
    render(
      <ErrorFallback error={new AppError('STORAGE_FULL', 'penuh')} onReset={() => undefined} />,
    );
    expect(screen.getByText(/hampir penuh/)).toBeInTheDocument();
    expect(screen.getByText('STORAGE_FULL')).toBeInTheDocument();
  });
});
