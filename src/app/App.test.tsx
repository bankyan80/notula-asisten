import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('App', () => {
  it('merender shell dengan brand Notula Assistent', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Notula Assistent' })).toBeInTheDocument();
    expect(screen.getByText('Asisten rapat cerdas')).toBeInTheDocument();
  });

  it('merender navigasi bawah menuju layar utama', () => {
    render(<App />);
    expect(screen.getByRole('navigation', { name: 'Navigasi utama' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Rapat' })).toHaveAttribute('href', '/rapat');
    expect(screen.getByRole('link', { name: 'Notulen' })).toHaveAttribute('href', '/notulen');
  });
});
