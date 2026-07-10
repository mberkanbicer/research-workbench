const LEVELS = ['debug', 'info', 'warn', 'error'] as const;
type Level = typeof LEVELS[number];

function log(level: Level, msg: string, meta?: Record<string, unknown>, pkg?: string) {
  const entry: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    msg,
  };
  if (pkg) entry.pkg = pkg;
  if (meta) Object.assign(entry, meta);
  const output = JSON.stringify(entry);
  if (level === 'error') console.error(output);
  else if (level === 'warn') console.warn(output);
  else console.log(output);
}

export function createLogger(pkg?: string) {
  return {
    debug: (msg: string, meta?: Record<string, unknown>) => log('debug', msg, meta, pkg),
    info: (msg: string, meta?: Record<string, unknown>) => log('info', msg, meta, pkg),
    warn: (msg: string, meta?: Record<string, unknown>) => log('warn', msg, meta, pkg),
    error: (msg: string, meta?: Record<string, unknown>) => log('error', msg, meta, pkg),
  };
}

export const logger = createLogger();
