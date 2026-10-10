/**
 * Logging terstruktur — satu kontrak untuk seluruh aplikasi.
 * Larangan: no-console (kecuali lewat logger ini), tanpa data sensitif di log.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogRecord {
  level: LogLevel;
  /** Modul/area, contoh: 'recording', 'transcription' */
  scope: string;
  message: string;
  data?: Record<string, unknown>;
  error?: { name: string; message: string; code?: string };
  timestamp: string;
}

export interface LogSink {
  write(record: LogRecord): void;
}

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export const consoleSink: LogSink = {
  write(record) {
    const payload = `[${record.timestamp}] ${record.level.toUpperCase()} ${record.scope}: ${record.message}`;
    const extra = record.error ?? record.data;
    if (record.level === 'error') {
      console.error(payload, extra ?? '');
    } else if (record.level === 'warn') {
      console.warn(payload, extra ?? '');
    } else {
      console.log(payload, extra ?? '');
    }
  },
};

/** Sink senyap untuk unit test. */
export function createMemorySink(): LogSink & { records: LogRecord[] } {
  const records: LogRecord[] = [];
  return {
    records,
    write(record) {
      records.push(record);
    },
  };
}

export interface LoggerOptions {
  level?: LogLevel;
  sink?: LogSink;
}

interface LoggerConfig {
  level: LogLevel;
  sink: LogSink;
}

const defaultConfig: LoggerConfig = { level: 'info', sink: consoleSink };

export function configureLogger(options: LoggerOptions): void {
  if (options.level) defaultConfig.level = options.level;
  if (options.sink) defaultConfig.sink = options.sink;
}

export function resetLogger(): void {
  defaultConfig.level = 'info';
  defaultConfig.sink = consoleSink;
}

export interface Logger {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, error?: unknown, data?: Record<string, unknown>): void;
}

function serializeError(error: unknown): LogRecord['error'] {
  if (error instanceof Error) {
    const code =
      'code' in error && typeof (error as { code?: unknown }).code === 'string'
        ? (error as { code: string }).code
        : undefined;
    return { name: error.name, message: error.message, ...(code ? { code } : {}) };
  }
  if (error === undefined || error === null) return undefined;
  return { name: 'Unknown', message: String(error) };
}

export function createLogger(scope: string): Logger {
  const emit = (
    level: LogLevel,
    message: string,
    extra?: Record<string, unknown>,
    error?: unknown,
  ) => {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[defaultConfig.level]) return;
    defaultConfig.sink.write({
      level,
      scope,
      message,
      ...(extra ? { data: extra } : {}),
      ...(error !== undefined && serializeError(error)
        ? { error: serializeError(error) as LogRecord['error'] }
        : {}),
      timestamp: new Date().toISOString(),
    });
  };

  return {
    debug: (message, data) => emit('debug', message, data),
    info: (message, data) => emit('info', message, data),
    warn: (message, data) => emit('warn', message, data),
    error: (message, error, data) => emit('error', message, data, error),
  };
}
