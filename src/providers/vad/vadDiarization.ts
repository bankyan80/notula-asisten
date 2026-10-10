/**
 * Provider diarization lokal (Batch 08) — berbasis audio, bukan teks.
 *
 * Nyata: decode file chunk → VAD + fitur akustik → giliran bicara per pembicara.
 * Jujur (PRD §13): output hanya kode `speaker_N`, TIDAK pernah mengklaim
 * identitas orang; penamaan manual oleh pengguna.
 *
 * Butuh Web Audio (AudioContext + OfflineAudioContext) untuk decode — di jsdom
 * `isAvailable()` false dan pipeline melewatinya tanpa mengarang hasil.
 */
import type {
  DiarizationRequest,
  SpeakerDiarizationProvider,
  SpeakerSegment,
} from '../../core/types/providers';
import { decodeAudioToPcm16k } from '../whisper/decodeAudio';
import { WHISPER_SAMPLE_RATE } from '../whisper/whisperProtocol';
import { detectSpeakerSegments, VAD_FRAME_SIZE } from './detectSpeakers';

export class VadSpeakerDiarizationProvider implements SpeakerDiarizationProvider {
  readonly id = 'vad-local';

  async isAvailable(): Promise<boolean> {
    return typeof AudioContext !== 'undefined' && typeof OfflineAudioContext !== 'undefined';
  }

  async identifySegments(request: DiarizationRequest): Promise<SpeakerSegment[]> {
    const blob = await request.readAudio();
    const pcm = await decodeAudioToPcm16k(blob);
    if (pcm.length < VAD_FRAME_SIZE) return [];
    return detectSpeakerSegments(pcm, WHISPER_SAMPLE_RATE);
  }
}
