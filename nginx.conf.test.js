import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const config = readFileSync(new URL('./nginx.conf', import.meta.url), 'utf8');

function getLocationBlock(path) {
  const match = config.match(
    new RegExp(
      `location\\s+${path.replace('/', '\\/')}\\s*\\{[\\s\\S]*?\\n    \\}`
    )
  );
  return match?.[0] || '';
}

describe('nginx security headers', () => {
  it('sets frontend CSP and HSTS at server level', () => {
    expect(config).toContain(
      'add_header Content-Security-Policy $site_csp always;'
    );
    expect(config).toContain(
      'add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;'
    );
    expect(config).toContain("default-src 'self'");
    expect(config).toContain("object-src 'none'");
    expect(config).toContain("frame-ancestors 'none'");
    expect(config).toContain(
      "script-src 'self' 'unsafe-inline' https://mc.yandex.ru"
    );
    expect(config).toContain(
      "connect-src 'self' https://mc.yandex.ru https://*.mc.yandex.ru https://*.ingest.sentry.io https://*.sentry.io"
    );
  });

  it('duplicates security headers in /assets because add_header is not inherited there', () => {
    const assetsBlock = getLocationBlock('/assets/');

    expect(assetsBlock).toContain(
      'add_header Content-Security-Policy $site_csp always;'
    );
    expect(assetsBlock).toContain(
      'add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;'
    );
    expect(assetsBlock).toContain(
      'add_header X-Content-Type-Options nosniff always;'
    );
    expect(assetsBlock).toContain('add_header X-Frame-Options DENY always;');
    expect(assetsBlock).toContain(
      'add_header Referrer-Policy strict-origin-when-cross-origin always;'
    );
  });
});

describe('nginx compression', () => {
  it('enables brotli with gzip fallback for text assets', () => {
    expect(config).toContain('brotli on;');
    expect(config).toContain('brotli_static on;');
    expect(config).toContain('brotli_comp_level 5;');
    expect(config).toContain('brotli_min_length 1024;');
    expect(config).toContain('brotli_types');
    expect(config).toContain('text/html');
    expect(config).toContain('application/javascript');
    expect(config).toContain('application/json');
    expect(config).toContain('image/svg+xml');
    expect(config).toContain('gzip on;');
    expect(config).toContain('gzip_vary on;');
  });
});

describe('nginx product prerender routing', () => {
  it('serves flat product prerender files for pretty product URLs', () => {
    expect(config).toContain('location ~ ^/product/([A-Za-z0-9-]+)/?$');
    expect(config).toContain(
      'try_files /runtime-data/public/product/$1.html /html/product/$1.html /html/index.html;'
    );
  });
});

describe('nginx runtime import artifacts', () => {
  it('serves updated price, robots and sitemaps before build-time fallbacks', () => {
    expect(config).toContain('root /usr/share/nginx/html;');
    expect(config).toContain(
      'location ~ ^/(robots\\.txt|sitemap(?:-[A-Za-z0-9-]+)?\\.xml|price\\.xls)$'
    );
    expect(config).toContain('root /usr/share/nginx;');
    expect(config).toContain(
      'try_files /runtime-data/public/$1 /html/$1 =404;'
    );
  });

  it('loads slug redirects from the runtime data directory only', () => {
    const runtimeInclude =
      'include /usr/share/nginx/runtime-data/public/redirects.nginx.conf*;';
    const buildInclude = 'include /usr/share/nginx/html/redirects.nginx.conf*;';

    expect(config).toContain(runtimeInclude);
    expect(config).not.toContain(buildInclude);
  });
});
