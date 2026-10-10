/**
 * StorageProvider berbasis OPFS (Origin Private File System) — web.
 *
 * Menulis file nyata ke perangkat mengikuti struktur `core/utils/paths.ts`:
 *   Meetings/{meetingId}/audio/000001.m4a
 *
 * Jujur: bila OPFS tidak tersedia (browser lama/jsdom), SEMUA operasi melempar
 * AppError PROVIDER_UNAVAILABLE — tidak pernah berpura-pura menulis.
 */
import { AppError, isQuotaExceededError } from '../../core/errors/AppError';
import type { StorageEstimateInfo, StorageProvider } from '../../core/types/providers';
import { MEETINGS_ROOT, meetingRoot } from '../../core/utils/paths';

function isNotFound(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'NotFoundError';
}

function toAppError(
  error: unknown,
  code: 'STORAGE_WRITE_FAILED' | 'STORAGE_READ_FAILED',
): AppError {
  if (error instanceof AppError) return error;
  return new AppError(code, 'Operasi file di perangkat gagal.', { cause: error });
}

export class OpfsStorageProvider implements StorageProvider {
  readonly id = 'opfs';

  private async rootDir(): Promise<FileSystemDirectoryHandle> {
    if (typeof navigator === 'undefined' || typeof navigator.storage?.getDirectory !== 'function') {
      throw new AppError(
        'PROVIDER_UNAVAILABLE',
        'Penyimpanan file perangkat (OPFS) tidak tersedia di browser ini.',
      );
    }
    return navigator.storage.getDirectory();
  }

  private async resolveParent(
    relativePath: string,
    create: boolean,
  ): Promise<{ parent: FileSystemDirectoryHandle; name: string }> {
    const parts = relativePath.split('/').filter((part) => part.length > 0);
    if (parts.length === 0 || parts.some((part) => part === '.' || part === '..')) {
      throw new AppError('VALIDATION_ERROR', `Path file tidak valid: ${relativePath}`);
    }
    const name = parts.pop() as string;
    let parent = await this.rootDir();
    for (const part of parts) {
      parent = await parent.getDirectoryHandle(part, { create });
    }
    return { parent, name };
  }

  async writeBlob(relativePath: string, data: Blob): Promise<string> {
    try {
      const { parent, name } = await this.resolveParent(relativePath, true);
      const fileHandle = await parent.getFileHandle(name, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(data);
      await writable.close();
      return relativePath;
    } catch (error) {
      if (isQuotaExceededError(error)) {
        throw new AppError('STORAGE_FULL', 'Penyimpanan perangkat penuh.', { cause: error });
      }
      throw toAppError(error, 'STORAGE_WRITE_FAILED');
    }
  }

  async writeText(relativePath: string, text: string): Promise<string> {
    return this.writeBlob(relativePath, new Blob([text], { type: 'text/plain' }));
  }

  async readBlob(relativePath: string): Promise<Blob> {
    try {
      const { parent, name } = await this.resolveParent(relativePath, false);
      const fileHandle = await parent.getFileHandle(name);
      return await fileHandle.getFile();
    } catch (error) {
      if (isNotFound(error)) {
        throw new AppError('NOT_FOUND', `File tidak ditemukan: ${relativePath}`, { cause: error });
      }
      throw toAppError(error, 'STORAGE_READ_FAILED');
    }
  }

  async readText(relativePath: string): Promise<string> {
    const blob = await this.readBlob(relativePath);
    return blob.text();
  }

  async exists(relativePath: string): Promise<boolean> {
    try {
      const { parent, name } = await this.resolveParent(relativePath, false);
      await parent.getFileHandle(name);
      return true;
    } catch (error) {
      if (isNotFound(error)) return false;
      throw error;
    }
  }

  async remove(relativePath: string): Promise<void> {
    try {
      const { parent, name } = await this.resolveParent(relativePath, false);
      await parent.removeEntry(name, { recursive: true });
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (isNotFound(error)) return; // idempotent: menghapus yang tidak ada bukan error
      throw new AppError('STORAGE_WRITE_FAILED', 'Gagal menghapus file dari perangkat.', {
        cause: error,
      });
    }
  }

  async removeMeeting(meetingId: string): Promise<void> {
    try {
      const root = await this.rootDir();
      let meetingsDir: FileSystemDirectoryHandle;
      try {
        meetingsDir = await root.getDirectoryHandle(MEETINGS_ROOT);
      } catch (error) {
        if (isNotFound(error)) return;
        throw error;
      }
      await meetingsDir.removeEntry(meetingId, { recursive: true });
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (isNotFound(error)) return;
      throw new AppError('STORAGE_WRITE_FAILED', 'Gagal menghapus folder rapat.', {
        cause: error,
        context: { meetingId, root: meetingRoot(meetingId) },
      });
    }
  }

  async list(directoryPath: string): Promise<string[]> {
    try {
      const parts = directoryPath.split('/').filter((part) => part.length > 0);
      if (parts.length === 0 || parts.some((part) => part === '.' || part === '..')) {
        throw new AppError('VALIDATION_ERROR', `Path direktori tidak valid: ${directoryPath}`);
      }

      let current: FileSystemDirectoryHandle | null = null;
      try {
        current = await this.rootDir();
        for (const part of parts) {
          current = await current.getDirectoryHandle(part);
        }
      } catch (error) {
        // Direktori belum ada = belum ada file (bukan kesalahan).
        if (isNotFound(error)) return [];
        throw error;
      }

      const paths: string[] = [];
      const walk = async (dir: FileSystemDirectoryHandle, prefix: string): Promise<void> => {
        for await (const [name, handle] of dir.entries()) {
          const path = `${prefix}/${name}`;
          if (handle.kind === 'directory') {
            await walk(handle, path);
          } else {
            paths.push(path);
          }
        }
      };
      await walk(current, directoryPath);
      return paths.sort();
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw toAppError(error, 'STORAGE_READ_FAILED');
    }
  }

  async estimate(): Promise<StorageEstimateInfo> {
    if (typeof navigator === 'undefined' || typeof navigator.storage?.estimate !== 'function') {
      return { isEstimated: true }; // jujur: tidak ada angka
    }
    try {
      const result = await navigator.storage.estimate();
      const quotaBytes = result.quota;
      const usedBytes = result.usage;
      return {
        ...(quotaBytes !== undefined ? { quotaBytes } : {}),
        ...(usedBytes !== undefined ? { usedBytes } : {}),
        ...(quotaBytes !== undefined && usedBytes !== undefined
          ? { freeBytes: Math.max(0, quotaBytes - usedBytes) }
          : {}),
        isEstimated: true,
      };
    } catch {
      return { isEstimated: true };
    }
  }
}
