/**
 * Fitur akustik murni untuk diarization sederhana (Batch 08) — tanpa DOM,
 * tanpa Web Audio: bisa diuji dengan sinyal sintetis.
 *
 * Dipakai: RMS (VAD), zero-crossing rate, dan spectral centroid (FFT radix-2).
 */

/** FFT radix-2 in-place. `re/im` panjang N = pangkat 2. */
export function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  // Bit reversal.
  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const angle = (-2 * Math.PI) / len;
    const wRe = Math.cos(angle);
    const wIm = Math.sin(angle);
    for (let i = 0; i < n; i += len) {
      let curRe = 1;
      let curIm = 0;
      for (let k = 0; k < len / 2; k += 1) {
        const uRe = re[i + k];
        const uIm = im[i + k];
        const vRe = re[i + k + len / 2] * curRe - im[i + k + len / 2] * curIm;
        const vIm = re[i + k + len / 2] * curIm + im[i + k + len / 2] * curRe;
        re[i + k] = uRe + vRe;
        im[i + k] = uIm + vIm;
        re[i + k + len / 2] = uRe - vRe;
        im[i + k + len / 2] = uIm - vIm;
        const nextRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
      }
    }
  }
}

/** Magnitude spektrum |X[k]| untuk k = 0..N/2 (N pangkat 2). */
export function fftMagnitudes(frame: Float32Array, size: number): Float64Array {
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  const windowLength = Math.min(frame.length, size);
  for (let i = 0; i < windowLength; i += 1) {
    // Hann ringan meredam tepi frame (spektrum lebih bersih).
    const hann = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (windowLength - 1));
    re[i] = (frame[i] ?? 0) * hann;
  }
  fft(re, im);
  const magnitudes = new Float64Array(size / 2 + 1);
  for (let k = 0; k <= size / 2; k += 1) {
    magnitudes[k] = Math.hypot(re[k] ?? 0, im[k] ?? 0);
  }
  return magnitudes;
}

/** RMS energi sinyal. */
export function rms(signal: Float32Array, start: number, length: number): number {
  let sum = 0;
  const end = Math.min(signal.length, start + length);
  let count = 0;
  for (let i = start; i < end; i += 1) {
    const value = signal[i] ?? 0;
    sum += value * value;
    count += 1;
  }
  return count === 0 ? 0 : Math.sqrt(sum / count);
}

/** Zero-crossing rate sinyal dalam [0, 1]. */
export function zeroCrossingRate(signal: Float32Array, start: number, length: number): number {
  const end = Math.min(signal.length, start + length);
  if (end - start < 2) return 0;
  let crossings = 0;
  let previous = signal[start] ?? 0;
  for (let i = start + 1; i < end; i += 1) {
    const current = signal[i] ?? 0;
    if ((current >= 0 && previous < 0) || (current < 0 && previous >= 0)) crossings += 1;
    previous = current;
  }
  return crossings / (end - start - 1);
}

/**
 * Spectral centroid frame (Hz) — indikator "terang/gelap" suara; beda pembicara
 * (register, artikulasi) memberi centroid berbeda.
 */
export function spectralCentroid(
  signal: Float32Array,
  start: number,
  length: number,
  sampleRate: number,
): number {
  const size = 256;
  const frame = signal.subarray(start, Math.min(signal.length, start + length));
  const magnitudes = fftMagnitudes(frame, size);
  let weighted = 0;
  let total = 0;
  for (let k = 1; k < magnitudes.length; k += 1) {
    const magnitude = magnitudes[k] ?? 0;
    const frequency = (k * sampleRate) / size;
    weighted += frequency * magnitude;
    total += magnitude;
  }
  return total === 0 ? 0 : weighted / total;
}
