// @vitest-environment jsdom
// Файл проверяет рендер главной страницы, SEO, hero-форму и ключевые блоки витрины.

import '../test/renderTestSetup.js';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { PrerenderDataProvider } from '../lib/prerenderData.jsx';
import HomePage from './HomePage.jsx';

const featuredProduct = {
  id: 101,
  slug: 'vvgng-ls-3h2-5',
  sku: 'SKU-101',
  title: 'ВВГнг(A)-LS 3х2,5',
  mark: 'ВВГнг(A)-LS',
  category: 'Силовой кабель',
  catalogCategory: 'Силовой кабель',
  price: 125.5,
  unit: 'м',
  stock: 42,
  shortDescription: 'ВВГнг(A)-LS · 3х2,5 мм2',
  image: '/product-placeholder.svg',
};

describe('HomePage SSR render', () => {
  it('рендерит складскую витрину из prerender data без loading-фолбэка', () => {
    const html = renderToString(
      <MemoryRouter>
        <PrerenderDataProvider
          data={{ home: { featuredProducts: [featuredProduct] } }}
        >
          <HomePage />
        </PrerenderDataProvider>
      </MemoryRouter>
    );

    expect(html).toContain('Из наличия на складе');
    expect(html).toContain('ВВГнг(A)-LS 3х2,5');
    expect(html).not.toContain('Загружаем актуальные позиции');
    expect(html).not.toContain('aria-busy="true"');
    expect(html).not.toContain('<!--$!--><template');
  });
});
