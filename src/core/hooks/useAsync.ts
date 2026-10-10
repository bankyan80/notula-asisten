/**
 * Hook async generik dengan reload — dipakai semua halaman untuk membaca
 * repository tanpa mengulang logika loading/error di tiap halaman.
 *
 * `loading` diturunkan dari perbandingan kunci permintaan vs hasil terakhir,
 * sehingga effect tidak perlu memanggil setState secara sinkron.
 */
import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react';

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: unknown;
  reload: () => void;
}

const objectIds = new WeakMap<object, number>();
let nextObjectId = 1;

/** Identitas stabil untuk tiap elemen deps (objek/fungsi → id unik, primitif → nilai). */
function identityOf(value: unknown): string {
  if (value === null || value === undefined) return String(value);
  if (typeof value === 'object' || typeof value === 'function') {
    let id = objectIds.get(value);
    if (id === undefined) {
      id = nextObjectId++;
      objectIds.set(value, id);
    }
    return `o${id}`;
  }
  return `${typeof value}:${String(value)}`;
}

interface AsyncResult<T> {
  key: string;
  data: T | null;
  error: unknown;
}

export function useAsync<T>(loader: () => Promise<T>, deps: DependencyList): AsyncState<T> {
  const [reloadCount, setReloadCount] = useState(0);
  const [result, setResult] = useState<AsyncResult<T> | null>(null);

  const key = `${deps.map(identityOf).join('|')}#${reloadCount}`;

  // Sinkronkan loader terbaru ke ref SEBELUM effect fetch berjalan
  // (React mengeksekusi effect sesuai urutan deklarasi).
  const loaderRef = useRef(loader);
  useEffect(() => {
    loaderRef.current = loader;
  }, [loader]);

  useEffect(() => {
    let active = true;
    loaderRef
      .current()
      .then((data) => {
        if (active) setResult({ key, data, error: null });
      })
      .catch((error: unknown) => {
        if (active) setResult({ key, data: null, error });
      });
    return () => {
      active = false;
    };
    // deps sengaja hanya `key`: caller menentukan kapan loader dijalankan ulang.
  }, [key]);

  const reload = useCallback(() => setReloadCount((value) => value + 1), []);

  const isCurrent = result !== null && result.key === key;
  return {
    data: isCurrent ? result.data : null,
    loading: !isCurrent,
    error: isCurrent ? result.error : null,
    reload,
  };
}
