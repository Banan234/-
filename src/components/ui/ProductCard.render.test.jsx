// @vitest-environment jsdom
// Файл проверяет рендер товарной карточки, действия пользователя и доступные подписи.

import '../../test/renderTestSetup.js';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import ProductCard from './ProductCard.jsx';
import { useCartStore } from '../../store/useCartStore.js';

const baseProduct = {
  id: 10,
  slug: 'request-price-card',
  sku: 'RPC-010',
  title: 'Кабель под расчет',
  fullName: 'Кабель под расчет',
  mark: 'Кабель под расчет',
  category: 'Силовой кабель',
  price: 0,
  stock: 12,
  unit: 'м',
  image: '/product-placeholder.svg',
  shortDescription: 'Тестовая позиция без открытой цены.',
};

function renderCard(product = baseProduct) {
  render(
    <MemoryRouter
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <ProductCard product={product} />
    </MemoryRouter>
  );
}

beforeEach(() => {
  useCartStore.setState({ items: [] });
});

describe('ProductCard', () => {
  it('показывает цену по запросу при price=0', () => {
    renderCard();

    expect(screen.getByText('Кабель под расчет')).toBeInTheDocument();
    expect(screen.getByText('Цена по запросу')).toBeInTheDocument();
    expect(screen.queryByText('/ м')).not.toBeInTheDocument();
  });
});
