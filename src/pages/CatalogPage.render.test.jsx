// @vitest-environment jsdom

import '../test/renderTestSetup.js';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchProducts } from '../lib/productsApi.js';
import { PrerenderDataProvider } from '../lib/prerenderData.jsx';
import CatalogPage, {
  doesCatalogPrerenderDataMatchQuery,
} from './CatalogPage.jsx';

vi.mock('../lib/productsApi.js', () => ({
  fetchProducts: vi.fn(),
}));

function renderCatalogPage(initialEntry = '/catalog', prerenderData = {}) {
  render(
    <PrerenderDataProvider data={prerenderData}>
      <MemoryRouter
        initialEntries={[initialEntry]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Routes>
          <Route path="/catalog" element={<CatalogPage />} />
          <Route path="/catalog/:slug" element={<CatalogPage />} />
        </Routes>
      </MemoryRouter>
    </PrerenderDataProvider>
  );
}

beforeEach(() => {
  fetchProducts.mockReset();
  fetchProducts.mockResolvedValue({
    items: [],
    meta: {
      total: 0,
      catalogCount: 0,
      catalogSections: [
        {
          slug: 'kabel-i-provod',
          name: 'Кабель и провод',
          categories: [],
        },
      ],
    },
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('CatalogPage', () => {
  it('оставляет общий h1 на /catalog, даже если API вернул одну секцию', async () => {
    renderCatalogPage();

    await waitFor(() => expect(fetchProducts).toHaveBeenCalled());

    expect(
      screen.getByRole('heading', { level: 1, name: 'Каталог продукции' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { level: 1, name: 'Кабель и провод' })
    ).not.toBeInTheDocument();
  });

  it('не делает стартовый fetch, если prerender data совпадает с /catalog', async () => {
    vi.useFakeTimers();
    const prerenderData = {
      catalog: {
        path: '/catalog',
        items: [
          {
            id: 1,
            slug: 'vvg-3x2-5',
            title: 'ВВГ 3х2,5',
            mark: 'ВВГ',
            price: 100,
            stock: 10,
          },
        ],
        catalogSections: [],
        meta: {
          total: 1,
          catalogCount: 1,
          pagination: { page: 1, limit: 24, total: 1, totalPages: 1 },
        },
      },
    };

    renderCatalogPage('/catalog', prerenderData);

    expect(fetchProducts).not.toHaveBeenCalled();
    expect(screen.getByText('ВВГ 3х2,5')).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
    });

    expect(fetchProducts).toHaveBeenCalledTimes(1);
  });

  it('считает prerender data неподходящими при фильтрах или другой странице', () => {
    const prerenderData = {
      path: '/catalog',
      meta: {
        pagination: { page: 1, limit: 24 },
      },
    };

    expect(
      doesCatalogPrerenderDataMatchQuery({
        activeCategoryParam: '',
        prerenderData,
        productQueryOptions: { limit: 24 },
      })
    ).toBe(true);
    expect(
      doesCatalogPrerenderDataMatchQuery({
        activeCategoryParam: '',
        prerenderData,
        productQueryOptions: { limit: 24, page: 2 },
      })
    ).toBe(false);
    expect(
      doesCatalogPrerenderDataMatchQuery({
        activeCategoryParam: '',
        prerenderData,
        productQueryOptions: { limit: 24, search: 'ввг' },
      })
    ).toBe(false);
  });
});
