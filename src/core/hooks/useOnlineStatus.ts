/** Status koneksi nyata dari browser (navigator.onLine + event online/offline). */
import { useEffect, useState } from 'react';

export function useOnlineStatus(): boolean {
  // Nilai awal dibaca saat render pertama; effect HANYA berlangganan event.
  const [online, setOnline] = useState<boolean>(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );

  useEffect(() => {
    const handleOnline = (): void => setOnline(true);
    const handleOffline = (): void => setOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return online;
}
