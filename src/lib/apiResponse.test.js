import { describe, expect, it } from 'vitest';
import { expectOkApiJson, readApiJson } from './apiResponse.js';

function response(body, { ok = true, status = 200 } = {}) {
  return new Response(body, {
    status,
    statusText: ok ? 'OK' : 'Error',
  });
}

describe('apiResponse helpers', () => {
  it('returns parsed JSON for successful API responses', async () => {
    await expect(
      expectOkApiJson(response(JSON.stringify({ ok: true, item: 1 })), 'fail')
    ).resolves.toEqual({ ok: true, item: 1 });
  });

  it('uses API error message when response is valid JSON', async () => {
    await expect(
      expectOkApiJson(
        response(JSON.stringify({ ok: false, message: 'Недоступно' }), {
          ok: false,
          status: 503,
        }),
        'fallback'
      )
    ).rejects.toThrow('Недоступно');
  });

  it('uses fallback message for HTML proxy errors', async () => {
    await expect(
      expectOkApiJson(
        response('<html>Bad gateway</html>', { ok: false, status: 502 }),
        'Сервис временно недоступен'
      )
    ).rejects.toThrow('Сервис временно недоступен');
  });

  it('treats an empty body as an empty object', async () => {
    await expect(readApiJson(response(''), 'fallback')).resolves.toEqual({});
  });
});
