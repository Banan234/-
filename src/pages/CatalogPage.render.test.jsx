// @vitest-environment jsdom

import '../test/renderTestSetup.js';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchProducts } from '../lib/productsApi.js';
import CatalogPage from './CatalogPage.jsx';

vi.mock('../lib/productsApi.js', () => ({
  fetchProducts: vi.fn(),
}));

function renderCatalogPage(initialEntry = '/catalog') {
  render(
    <MemoryRouter
      initialEntries={[initialEntry]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Routes>
        <Route path="/catalog" element={<CatalogPage />} />
        <Route path="/catalog/:slug" element={<CatalogPage />} />
      </Routes>
    </MemoryRouter>
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
});
