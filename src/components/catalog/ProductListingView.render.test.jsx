// @vitest-environment jsdom

import '../../test/renderTestSetup.js';
import { useEffect } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ProductListingView from './ProductListingView.jsx';

function makeProduct(overrides) {
  return {
    id: overrides.id,
    slug: overrides.slug,
    sku: overrides.sku || `SKU-${overrides.id}`,
    title: overrides.title,
    fullName: overrides.fullName || overrides.title,
    mark: overrides.mark || overrides.title,
    category: 'Силовой кабель',
    price: overrides.price || 120,
    stock: overrides.stock ?? 250,
    unit: 'м',
    image: '/product-placeholder.svg',
    shortDescription: 'Кабель для промышленных и строительных объектов',
    conductorMaterial: overrides.conductorMaterial || 'медь',
    isAluminum: overrides.isAluminum || false,
    cores: overrides.cores || 3,
    crossSection: overrides.crossSection || 2.5,
    voltage: overrides.voltage || 0.66,
    ...overrides,
  };
}

const products = [
  makeProduct({
    id: 1,
    slug: 'vvgng-ls-3x25',
    title: 'ВВГнг-LS 3x2.5',
    mark: 'ВВГнг-LS',
    sku: 'VVG-001',
    price: 120,
  }),
  makeProduct({
    id: 2,
    slug: 'avvg-4x16',
    title: 'АВВГ 4x16',
    mark: 'АВВГ',
    sku: 'AVVG-016',
    price: 310,
    conductorMaterial: 'алюминий',
    isAluminum: true,
    cores: 4,
    crossSection: 16,
    voltage: 1,
  }),
];

function LocationProbe({ onChange }) {
  const location = useLocation();

  useEffect(() => {
    onChange(location);
  }, [location, onChange]);

  return null;
}

function renderListing({ initialEntry = '/catalog', viewProps = {} } = {}) {
  let currentLocation;
  const handleLocationChange = vi.fn((location) => {
    currentLocation = location;
  });

  render(
    <MemoryRouter
      initialEntries={[initialEntry]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <LocationProbe onChange={handleLocationChange} />
      <ProductListingView
        products={products}
        isLoading={false}
        error={null}
        scopeKey="test-catalog"
        {...viewProps}
      />
    </MemoryRouter>
  );

  return {
    getSearchParam(name) {
      return new URLSearchParams(currentLocation?.search || '').get(name);
    },
  };
}

describe('ProductListingView render flow', () => {
  it('рендерит товары и счетчик результатов', () => {
    renderListing();

    expect(screen.getByText('ВВГнг-LS 3x2.5')).toBeInTheDocument();
    expect(screen.getByText('АВВГ 4x16')).toBeInTheDocument();
    expect(screen.getByText(/Найдено:/)).toHaveTextContent('2');
  });

  it('коммитит поиск в URL по Enter', async () => {
    const user = userEvent.setup();
    const { getSearchParam } = renderListing();

    await user.type(screen.getByRole('searchbox'), 'АВВГ');
    await user.keyboard('{Enter}');

    await waitFor(() => expect(getSearchParam('search')).toBe('АВВГ'));
    expect(screen.getByText('АВВГ 4x16')).toBeInTheDocument();
    expect(screen.queryByText('ВВГнг-LS 3x2.5')).not.toBeInTheDocument();
  });

  it('коммитит фасет материала в URL и обновляет aria-pressed', async () => {
    const user = userEvent.setup();
    const { getSearchParam } = renderListing();

    await user.click(screen.getByRole('button', { name: 'алюминий' }));

    await waitFor(() => expect(getSearchParam('material')).toBe('алюминий'));
    expect(screen.getByRole('button', { name: 'алюминий' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.queryByText('ВВГнг-LS 3x2.5')).not.toBeInTheDocument();
  });

  it('коммитит диапазон цены в URL', async () => {
    const user = userEvent.setup();
    const { getSearchParam } = renderListing();

    await user.type(screen.getByPlaceholderText('от'), '100');
    await user.type(screen.getByPlaceholderText('до'), '200');
    await user.click(screen.getByRole('button', { name: 'OK' }));

    await waitFor(() => {
      expect(getSearchParam('priceMin')).toBe('100');
      expect(getSearchParam('priceMax')).toBe('200');
    });
    expect(screen.getByText('ВВГнг-LS 3x2.5')).toBeInTheDocument();
    expect(screen.queryByText('АВВГ 4x16')).not.toBeInTheDocument();
  });
});
