// @vitest-environment jsdom
// Файл проверяет SEO статических информационных страниц: доставку, оплату и о компании.

import '../test/renderTestSetup.js';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CartPage from './CartPage.jsx';
import FavoritesPage from './FavoritesPage.jsx';
import { useCartStore } from '../store/useCartStore.js';
import { useFavoritesStore } from '../store/useFavoritesStore.js';

function renderPage(page, path) {
  render(
    <MemoryRouter
      initialEntries={[path]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      {page}
    </MemoryRouter>
  );
}

function getRobotsMetaContent() {
  return document.querySelector('meta[name="robots"]')?.getAttribute('content');
}

const noPriceItem = {
  id: 777,
  sku: 'NO-PRICE',
  slug: 'no-price',
  title: 'Кабель без цены',
  category: 'Силовой кабель',
  price: 0,
  quantity: 2,
  unit: 'м',
  image: '/product-placeholder.svg',
};

const pricedItem = {
  id: 778,
  sku: 'PRICE-ITEM',
  slug: 'price-item',
  title: 'Кабель с ценой',
  category: 'Силовой кабель',
  price: 600,
  quantity: 2,
  unit: 'м',
  image: '/product-placeholder.svg',
};

beforeEach(() => {
  useCartStore.setState({ items: [] });
  useFavoritesStore.setState({ items: [] });
});

describe('private pages SEO', () => {
  it('ставит noindex на страницу корзины', async () => {
    renderPage(<CartPage />, '/cart');

    await waitFor(() => {
      expect(getRobotsMetaContent()).toBe('noindex,follow');
    });
  });

  it('ставит noindex на страницу избранного', async () => {
    renderPage(<FavoritesPage />, '/favorites');

    await waitFor(() => {
      expect(getRobotsMetaContent()).toBe('noindex,follow');
    });
  });

  it('показывает расчет цены в КП для нулевой цены в корзине', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, found: [noPriceItem], missing: [] }),
      })
    );
    useCartStore.setState({ items: [noPriceItem] });

    renderPage(<CartPage />, '/cart');

    expect(screen.getByText('Кабель без цены')).toBeInTheDocument();
    expect(screen.getByText('Цена будет рассчитана в КП')).toBeInTheDocument();
    expect(screen.getByText('Итог будет рассчитан в КП')).toBeInTheDocument();
  });

  it('показывает в итогах корзины сумму и позиции по запросу вместе', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          ok: true,
          found: [pricedItem, noPriceItem],
          missing: [],
        }),
      })
    );
    useCartStore.setState({ items: [pricedItem, noPriceItem] });

    renderPage(<CartPage />, '/cart');

    expect(screen.getByText('Кабель с ценой')).toBeInTheDocument();
    expect(screen.getByText('Кабель без цены')).toBeInTheDocument();
    expect(
      screen.getByText('1 200 ₽ + позиции по запросу')
    ).toBeInTheDocument();
  });

  it('показывает цену по запросу для нулевой цены в избранном', () => {
    useFavoritesStore.setState({ items: [noPriceItem] });

    renderPage(<FavoritesPage />, '/favorites');

    expect(screen.getByText('Кабель без цены')).toBeInTheDocument();
    expect(screen.getByText('Цена по запросу')).toBeInTheDocument();
  });
});
