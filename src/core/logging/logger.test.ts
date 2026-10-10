import { afterEach, describe, expect, it } from 'vitest';
import { configureLogger, createLogger, createMemorySink, resetLogger } from './logger';

afterEach(() => {
  resetLogger();
});

describe('createLogger', () => {
  it('menulis record terstruktur ke sink', () => {
    const sink = createMemorySink();
    configureLogger({ level: 'debug', sink });

    const logger = createLogger('recording');
    logger.info('chunk disimpan', { sequence: 3 });

    expect(sink.records).toHaveLength(1);
    const record = sink.records[0];
    expect(record?.scope).toBe('recording');
    expect(record?.level).toBe('info');
    expect(record?.message).toBe('chunk disimpan');
    expect(record?.data).toEqual({ sequence: 3 });
    expect(record?.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('menyaring level di bawah ambang', () => {
    const sink = createMemorySink();
    configureLogger({ level: 'warn', sink });

    const logger = createLogger('sync');
    logger.debug('debug disembunyikan');
    logger.info('info disembunyikan');
    logger.warn('warn tampil');
    logger.error('error tampil');

    expect(sink.records.map((r) => r.level)).toEqual(['warn', 'error']);
  });

  it('serialize error menjadi bentuk aman untuk log', () => {
    const sink = createMemorySink();
    configureLogger({ level: 'debug', sink });

    createLogger('ai').error('ringkasan gagal', new AppErrorLike());

    const record = sink.records[0];
    expect(record?.error).toEqual({
      name: 'Error',
      message: 'provider down',
      code: 'PROVIDER_UNAVAILABLE',
    });
  });
});

class AppErrorLike extends Error {
  readonly code = 'PROVIDER_UNAVAILABLE';

  constructor() {
    super('provider down');
    this.name = 'Error';
  }
}
