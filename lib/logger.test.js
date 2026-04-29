import express from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  accessLog,
  getCurrentRequestId,
  logger,
  normalizeRequestId,
  redactLogString,
  sanitizeLogMeta,
  sanitizeRequestPath,
  serializeError,
} from './logger.js';

const originalEnv = {
  ACCESS_LOG_SLOW_MS: process.env.ACCESS_LOG_SLOW_MS,
  ACCESS_LOG_SUCCESS_SAMPLE_RATE: process.env.ACCESS_LOG_SUCCESS_SAMPLE_RATE,
  LOG_LEVEL: process.env.LOG_LEVEL,
  NODE_ENV: process.env.NODE_ENV,
  VITEST: process.env.VITEST,
};

function restoreEnv(name, value) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

afterEach(() => {
  restoreEnv('ACCESS_LOG_SLOW_MS', originalEnv.ACCESS_LOG_SLOW_MS);
  restoreEnv(
    'ACCESS_LOG_SUCCESS_SAMPLE_RATE',
    originalEnv.ACCESS_LOG_SUCCESS_SAMPLE_RATE
  );
  restoreEnv('LOG_LEVEL', originalEnv.LOG_LEVEL);
  restoreEnv('NODE_ENV', originalEnv.NODE_ENV);
  restoreEnv('VITEST', originalEnv.VITEST);
  vi.restoreAllMocks();
});

async function withServer(app, callback) {
  let server;
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  const { port } = server.address();

  try {
    return await callback(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

describe('logger PII redaction', () => {
  it('normalizes externally supplied request ids', () => {
    expect(normalizeRequestId('req-123_ABC:456')).toBe('req-123_ABC:456');
    expect(normalizeRequestId('ivan@example.com')).toBe('');
    expect(normalizeRequestId('+7 (900) 123-45-67')).toBe('');
    expect(normalizeRequestId('x'.repeat(129))).toBe('');
  });

  it('redacts emails, phones and sensitive query params in strings', () => {
    const value =
      'failed for ivan@example.com and +7 (900) 123-45-67 at /api/quote?email=ivan@example.com&phone=79001234567';

    const result = redactLogString(value);

    expect(result).not.toContain('ivan@example.com');
    expect(result).not.toContain('+7 (900) 123-45-67');
    expect(result).not.toContain('79001234567');
    expect(result).toContain('[redacted]');
  });

  it('logs request path without query string', () => {
    expect(
      sanitizeRequestPath(
        '/api/quote?email=ivan@example.com&phone=+79001234567'
      )
    ).toBe('/api/quote');
    expect(
      sanitizeRequestPath(
        'https://site.test/catalog?customerEmail=ivan@example.com'
      )
    ).toBe('/catalog');
  });

  it('redacts PII from error message and stack', () => {
    const error = Object.assign(
      new Error('SMTP failed for ivan@example.com / +7 (900) 123-45-67'),
      { code: 'ECONNRESET', responseCode: 421 }
    );
    error.stack =
      'Error: SMTP failed for ivan@example.com\n    at send (/api/quote?phone=79001234567)';

    const result = serializeError(error);
    const json = JSON.stringify(result);

    expect(json).not.toContain('ivan@example.com');
    expect(json).not.toContain('+7 (900) 123-45-67');
    expect(json).not.toContain('79001234567');
    expect(result.code).toBe('ECONNRESET');
    expect(result.responseCode).toBe(421);
  });

  it('redacts sensitive object keys recursively', () => {
    const result = sanitizeLogMeta({
      customerEmail: 'ivan@example.com',
      phoneNumber: '+7 (900) 123-45-67',
      nested: {
        url: '/api/quote?email=ivan@example.com&phone=79001234567',
      },
      status: 500,
    });
    const json = JSON.stringify(result);

    expect(result.customerEmail).toBe('[redacted]');
    expect(result.phoneNumber).toBe('[redacted]');
    expect(result.status).toBe(500);
    expect(json).not.toContain('ivan@example.com');
    expect(json).not.toContain('79001234567');
  });

  it('accessLog writes sanitized path without query PII', async () => {
    process.env.LOG_LEVEL = 'info';
    process.env.NODE_ENV = 'production';
    process.env.VITEST = 'false';
    process.env.ACCESS_LOG_SUCCESS_SAMPLE_RATE = '1';
    const writeSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
    const app = express();
    app.use(accessLog());
    app.get('/api/quote', (req, res) => res.json({ ok: true }));

    await withServer(app, async (baseUrl) => {
      await fetch(
        `${baseUrl}/api/quote?email=ivan@example.com&phone=+79001234567`
      );
    });

    const lines = writeSpy.mock.calls.map(([line]) => String(line));
    const record = JSON.parse(lines.find((line) => line.includes('"http"')));

    expect(record.path).toBe('/api/quote');
    expect(JSON.stringify(record)).not.toContain('ivan@example.com');
    expect(JSON.stringify(record)).not.toContain('79001234567');
  });

  it('propagates X-Request-Id to response, access log and route logs', async () => {
    process.env.LOG_LEVEL = 'info';
    process.env.NODE_ENV = 'production';
    process.env.VITEST = 'false';
    process.env.ACCESS_LOG_SUCCESS_SAMPLE_RATE = '1';
    const writeSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
    const app = express();
    app.use(accessLog());
    app.get('/api/health', (req, res) => {
      logger.info('route.handled', {
        currentRequestId: getCurrentRequestId(),
        requestIdOnReq: req.requestId,
      });
      res.json({ ok: true });
    });

    let response;
    await withServer(app, async (baseUrl) => {
      response = await fetch(`${baseUrl}/api/health`, {
        headers: { 'X-Request-Id': 'req-test-123' },
      });
      await response.json();
    });

    const records = writeSpy.mock.calls
      .map(([line]) => String(line))
      .filter(Boolean)
      .map((line) => JSON.parse(line));

    expect(response.headers.get('x-request-id')).toBe('req-test-123');
    expect(records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          msg: 'route.handled',
          request_id: 'req-test-123',
          currentRequestId: 'req-test-123',
          requestIdOnReq: 'req-test-123',
        }),
        expect.objectContaining({
          msg: 'http',
          request_id: 'req-test-123',
          path: '/api/health',
        }),
      ])
    );
  });

  it('generates a request id when incoming header is absent or invalid', async () => {
    process.env.LOG_LEVEL = 'info';
    process.env.NODE_ENV = 'production';
    process.env.VITEST = 'false';
    process.env.ACCESS_LOG_SUCCESS_SAMPLE_RATE = '1';
    const writeSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
    const app = express();
    app.use(accessLog());
    app.get('/api/health', (req, res) => res.json({ ok: true }));

    let response;
    await withServer(app, async (baseUrl) => {
      response = await fetch(`${baseUrl}/api/health`, {
        headers: { 'X-Request-Id': 'ivan@example.com' },
      });
      await response.json();
    });

    const generatedId = response.headers.get('x-request-id');
    const record = JSON.parse(
      writeSpy.mock.calls
        .map(([line]) => String(line))
        .find((line) => line.includes('"http"'))
    );

    expect(generatedId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
    expect(generatedId).not.toBe('ivan@example.com');
    expect(record.request_id).toBe(generatedId);
  });

  it('samples successful access logs while keeping warning responses', async () => {
    process.env.LOG_LEVEL = 'info';
    process.env.NODE_ENV = 'production';
    process.env.VITEST = 'false';
    process.env.ACCESS_LOG_SUCCESS_SAMPLE_RATE = '0';
    const stdoutSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
    const stderrSpy = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);
    const app = express();
    app.use(accessLog());
    app.get('/ok', (req, res) => res.json({ ok: true }));
    app.get('/missing', (req, res) => res.status(404).json({ ok: false }));

    await withServer(app, async (baseUrl) => {
      await fetch(`${baseUrl}/ok`);
      await fetch(`${baseUrl}/missing`);
    });

    expect(
      stdoutSpy.mock.calls.some(([line]) => String(line).includes('"http"'))
    ).toBe(false);

    const warnRecord = JSON.parse(
      stderrSpy.mock.calls
        .map(([line]) => String(line))
        .find((line) => line.includes('"http"'))
    );
    expect(warnRecord).toMatchObject({
      level: 'warn',
      msg: 'http',
      path: '/missing',
      status: 404,
    });
  });
});
