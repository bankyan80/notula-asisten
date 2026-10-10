import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './Button';

describe('Button', () => {
  it('merender label dan memanggil onClick', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Mulai Rapat</Button>);

    fireEvent.click(screen.getByRole('button', { name: 'Mulai Rapat' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('tidak bisa diklik saat disabled', () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Tersimpan
      </Button>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Tersimpan' }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('menampilkan indikator loading dan menonaktifkan tombol', () => {
    render(<Button loading>Simpan</Button>);
    expect(screen.getByRole('button', { name: 'Simpan' })).toBeDisabled();
  });
});
