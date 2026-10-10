import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusBadge } from './StatusBadge';

describe('StatusBadge', () => {
  it('menampilkan label sesuai status rapat', () => {
    const { rerender } = render(<StatusBadge status="DRAFT" />);
    expect(screen.getByText('Draf')).toBeInTheDocument();

    rerender(<StatusBadge status="RECORDING" />);
    expect(screen.getByText('Merekam')).toBeInTheDocument();

    rerender(<StatusBadge status="COMPLETED" />);
    expect(screen.getByText('Selesai')).toBeInTheDocument();

    rerender(<StatusBadge status="ERROR" />);
    expect(screen.getByText('Gagal')).toBeInTheDocument();
  });
});
