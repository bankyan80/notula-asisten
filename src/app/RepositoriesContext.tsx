/**
 * Provider repository untuk seluruh pohon UI.
 * Konteks & hook-nya berada di `useRepositories.ts` agar file ini hanya
 * mengekspor komponen (syarat fast-refresh).
 */
import type { ReactNode } from 'react';
import { getRepositories, type Repositories } from '../data';
import { RepositoriesContext } from './useRepositories';

interface RepositoriesProviderProps {
  children: ReactNode;
  repositories?: Repositories;
}

export function RepositoriesProvider({ children, repositories }: RepositoriesProviderProps) {
  const value = repositories ?? getRepositories();
  return <RepositoriesContext.Provider value={value}>{children}</RepositoriesContext.Provider>;
}
