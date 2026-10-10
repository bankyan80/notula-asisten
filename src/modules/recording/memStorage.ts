/**
 * StorageProvider ganda IN-MEMORY — HANYA untuk unit test (jsdom tidak punya
 * OPFS). Sengaja sederhana: daftar file diwakili satu Map path → Blob.
 */
import type { StorageEstimateInfo, StorageProvider } from '../../core/types/providers';

export class MemStorage implements StorageProvider {
  readonly id = 'mem';
  readonly files = new Map<string, Blob>();

  async writeBlob(relativePath: string, data: Blob): Promise<string> {
    this.files.set(relativePath, data);
    return relativePath;
  }

  async writeText(relativePath: string, text: string): Promise<string> {
    // Ditulis langsung (bukan lewat writeBlob) agar subkelas test bisa
    // menggagalkan satu jalur saja: file audio XOR manifest.
    this.files.set(relativePath, new Blob([text], { type: 'text/plain' }));
    return relativePath;
  }

  async readBlob(relativePath: string): Promise<Blob> {
    const blob = this.files.get(relativePath);
    if (!blob) throw new Error(`File tidak ditemukan: ${relativePath}`);
    return blob;
  }

  async readText(relativePath: string): Promise<string> {
    return (await this.readBlob(relativePath)).text();
  }

  async exists(relativePath: string): Promise<boolean> {
    return this.files.has(relativePath);
  }

  async remove(relativePath: string): Promise<void> {
    this.files.delete(relativePath);
  }

  async removeMeeting(meetingId: string): Promise<void> {
    const prefix = `Meetings/${meetingId}/`;
    for (const path of [...this.files.keys()]) {
      if (path.startsWith(prefix)) this.files.delete(path);
    }
  }

  async list(directoryPath: string): Promise<string[]> {
    const prefix = `${directoryPath}/`;
    return [...this.files.keys()].filter((path) => path.startsWith(prefix)).sort();
  }

  async estimate(): Promise<StorageEstimateInfo> {
    return { isEstimated: true };
  }
}
