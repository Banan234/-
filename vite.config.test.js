// Файл проверяет Vite-конфигурацию и HTML-transform, который приоритизирует stylesheet перед module script.

import { describe, expect, it } from 'vitest';
import { moveStylesheetsBeforeModuleScripts } from './vite.config.js';

describe('vite index html transforms', () => {
  it('moves stylesheet links before module scripts in head', () => {
    const html = [
      '<!doctype html>',
      '<html lang="ru">',
      '  <head>',
      '    <meta charset="UTF-8" />',
      '    <script type="module" crossorigin src="/assets/index.js"></script>',
      '    <link rel="stylesheet" crossorigin href="/assets/index.css">',
      '  </head>',
      '  <body><div id="root"></div></body>',
      '</html>',
    ].join('\n');

    const transformed = moveStylesheetsBeforeModuleScripts(html);

    expect(transformed.indexOf('rel="stylesheet"')).toBeLessThan(
      transformed.indexOf('type="module"')
    );
    expect(transformed.match(/rel="stylesheet"/g)).toHaveLength(1);
    expect(transformed.match(/type="module"/g)).toHaveLength(1);
  });
});
