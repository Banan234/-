// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { getBrowserPrerenderData } from './prerenderData.jsx';

afterEach(() => {
  document.body.innerHTML = '';
  document.head.innerHTML = '';
  delete window.__YUZHURAL_PRERENDER_DATA__;
  vi.restoreAllMocks();
});

describe('getBrowserPrerenderData', () => {
  it('читает prerender-data из non-executable JSON script', () => {
    const script = document.createElement('script');
    script.id = 'yuzhural-prerender-data';
    script.type = 'application/json';
    script.textContent = JSON.stringify({
      product: { slug: 'vvg', title: 'ВВГ' },
    });
    document.body.appendChild(script);

    expect(getBrowserPrerenderData()).toEqual({
      product: { slug: 'vvg', title: 'ВВГ' },
    });
  });

  it('оставляет fallback на старый window payload', () => {
    window.__YUZHURAL_PRERENDER_DATA__ = { product: { slug: 'legacy' } };

    expect(getBrowserPrerenderData()).toEqual({
      product: { slug: 'legacy' },
    });
  });

  it('не падает на битом JSON', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const script = document.createElement('script');
    script.id = 'yuzhural-prerender-data';
    script.type = 'application/json';
    script.textContent = '{bad json';
    document.body.appendChild(script);

    expect(getBrowserPrerenderData()).toEqual({});
    expect(warn).toHaveBeenCalledWith(
      'prerenderData: parse failed',
      expect.any(SyntaxError)
    );
  });
});
