// Минимальный структурированный логгер. Пишет одну JSON-строку на событие
// в stdout (для info/debug) и stderr (для warn/error) — формат ровно тот,
// что переваривают логосборщики (Loki, ELK, Datadog) без preprocessing.
// Без внешних зависимостей; если когда-то захотите pino — sigнатура
// logger.info(msg, meta) совместима, swap займёт одну правку импорта.
//
// Управление через env:
//   LOG_LEVEL  = debug | info | warn | error  (default: info)
//   NODE_ENV   = test  → логгер молчит (тесты не засоряются)
//   VITEST     = '1'   → то же самое (vitest выставляет автоматически)

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

function resolveLevel() {
  const env = String(process.env.LOG_LEVEL || '').toLowerCase();
  return LEVELS[env] ?? LEVELS.info;
}

function isSilenced() {
  return process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
}

function emit(level, msg, meta) {
  if (isSilenced()) return;
  if (LEVELS[level] < resolveLevel()) return;

  const record = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...(meta || {}),
  };

  // err → разворачиваем стек/название/код в плоские поля.
  if (meta?.err instanceof Error) {
    record.err = {
      name: meta.err.name,
      message: meta.err.message,
      code: meta.err.code,
      stack: meta.err.stack,
    };
  }

  const line = JSON.stringify(record);
  if (level === 'warn' || level === 'error') {
    process.stderr.write(line + '\n');
  } else {
    process.stdout.write(line + '\n');
  }
}

export const logger = {
  debug: (msg, meta) => emit('debug', msg, meta),
  info: (msg, meta) => emit('info', msg, meta),
  warn: (msg, meta) => emit('warn', msg, meta),
  error: (msg, meta) => emit('error', msg, meta),
};

// Express-middleware: пишет одну строку на запрос с методом, путём, статусом
// и длительностью. Подключается через app.use() — обычно одним из первых.
export function accessLog() {
  return (req, res, next) => {
    const startedAt = process.hrtime.bigint();
    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
      emit(level, 'http', {
        method: req.method,
        path: req.originalUrl || req.url,
        status: res.statusCode,
        duration_ms: Math.round(durationMs * 10) / 10,
        ip: req.ip,
      });
    });
    next();
  };
}
