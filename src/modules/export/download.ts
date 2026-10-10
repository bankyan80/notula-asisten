/** Unduh blob sebagai berkas di perangkat (anchor download + object URL). */
export function triggerDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Beri waktu browser memulai unduhan sebelum URL dicabut.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
