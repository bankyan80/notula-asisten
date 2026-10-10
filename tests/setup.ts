import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
// IndexedDB palsu untuk jsdom — Dexie (repository Batch 03) bisa diuji.
import 'fake-indexeddb/auto';

// Vitest berjalan tanpa globals, jadi auto-cleanup bawaan Testing Library tidak aktif.
afterEach(() => {
  cleanup();
});
