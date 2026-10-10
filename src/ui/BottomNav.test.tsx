import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { BottomNav } from './BottomNav';

function renderNav(initialPath = '/') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <BottomNav />
    </MemoryRouter>,
  );
}

describe('BottomNav', () => {
  it('menampilkan empat tujuan utama', () => {
    renderNav();
    expect(screen.getByRole('link', { name: /Beranda/ })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: /Rapat/ })).toHaveAttribute('href', '/rapat');
    expect(screen.getByRole('link', { name: /Notulen/ })).toHaveAttribute('href', '/notulen');
    expect(screen.getByRole('link', { name: /Akun/ })).toHaveAttribute('href', '/akun');
  });

  it('menandai tab aktif berdasarkan lokasi', () => {
    renderNav('/rapat');
    expect(screen.getByRole('link', { name: /Rapat/ })).toHaveClass('font-bold');
    expect(screen.getByRole('link', { name: /Beranda/ })).not.toHaveClass('font-bold');
  });
});
