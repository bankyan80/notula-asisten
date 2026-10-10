/**
 * Decode blob audio rekaman → gelombang mono 16 kHz (format input Whisper).
 * Berjalan di MAIN THREAD karena AudioContext tidak ada di Web Worker.
 *
 * Kegagalan decode (codec tak didukung browser) dilempar sebagai AppError
 * `TRANSCRIPTION_FAILED` non-retryable — percobaan ulang tidak akan membantu.
 */
import { AppError } from '../../core/errors/AppError';
import { WHISPER_SAMPLE_RATE } from './whisperProtocol';

function mixToMono(audioBuffer: AudioBuffer): Float32Array<ArrayBuffer> {
  if (audioBuffer.numberOfChannels === 1) {
    return new Float32Array(audioBuffer.getChannelData(0));
  }
  const mono = new Float32Array(audioBuffer.length);
  for (let channel = 0; channel < audioBuffer.numberOfChannels; channel += 1) {
    const data = audioBuffer.getChannelData(channel);
    for (let i = 0; i < data.length; i += 1) {
      mono[i] += data[i] / audioBuffer.numberOfChannels;
    }
  }
  return mono;
}

async function resampleTo16k(
  mono: Float32Array<ArrayBuffer>,
  sourceRate: number,
): Promise<Float32Array<ArrayBuffer>> {
  if (sourceRate === WHISPER_SAMPLE_RATE) return mono;
  const targetLength = Math.max(1, Math.ceil((mono.length * WHISPER_SAMPLE_RATE) / sourceRate));
  const offline = new OfflineAudioContext(1, targetLength, WHISPER_SAMPLE_RATE);
  const buffer = offline.createBuffer(1, mono.length, sourceRate);
  buffer.copyToChannel(mono, 0);
  const source = offline.createBufferSource();
  source.buffer = buffer;
  source.connect(offline.destination);
  source.start();
  const rendered = await offline.startRendering();
  // Salinan baru: AudioBuffer memegang referensi internalnya sendiri.
  return new Float32Array(rendered.getChannelData(0));
}

export async function decodeAudioToPcm16k(blob: Blob): Promise<Float32Array<ArrayBuffer>> {
  if (typeof AudioContext === 'undefined' || typeof OfflineAudioContext === 'undefined') {
    throw new AppError('PROVIDER_UNAVAILABLE', 'Decoder audio tidak tersedia di perangkat ini.');
  }
  let arrayBuffer: ArrayBuffer;
  try {
    arrayBuffer = await blob.arrayBuffer();
  } catch (error) {
    throw new AppError('TRANSCRIPTION_FAILED', 'Audio chunk tidak terbaca.', {
      cause: error,
      retryable: true,
    });
  }

  const context = new AudioContext();
  try {
    let decoded: AudioBuffer;
    try {
      decoded = await context.decodeAudioData(arrayBuffer);
    } catch (error) {
      throw new AppError(
        'TRANSCRIPTION_FAILED',
        'Format audio ini tidak didukung browser untuk transkripsi.',
        { cause: error, retryable: false },
      );
    }
    return await resampleTo16k(mixToMono(decoded), decoded.sampleRate);
  } finally {
    void context.close().catch(() => undefined);
  }
}
