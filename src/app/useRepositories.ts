/**
 * Dependency injection repository untuk UI.
 * Halaman hanya memanggil `useRepositories()` — tidak pernah tahu backend apa
 * yang dipakai (memory sekarang, IndexedDB di Batch 03, cloud opsional nanti).
 * Terpisah dari file komponen agar fast-refresh hanya melihat ekspor komponen.
 */
import { createContext, useContext } from 'react';
import type { Repositories } from '../data';

export const RepositoriesContext = createContext<Repositories | null>(null);

export function useRepositories(): Repositories {
  const repositories = useContext(RepositoriesContext);
  if (!repositories) {
    throw new Error('useRepositories harus dipakai di dalam <RepositoriesProvider>');
  }
  return repositories;
}
