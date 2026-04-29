// @vitest-environment jsdom

import '../../test/renderTestSetup.js';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchProductSuggestions } from '../../lib/productsApi.js';
import MainLayout from './MainLayout.jsx';
import { STORAGE_WRITE_FAILED_EVENT } from '../../lib/browserStorage.js';

vi.mock('../../lib/productsApi.js', () => ({
  fetchProductSuggestions: vi.fn(),
}));

function renderLayout(initialEntry = '/') {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <MainLayout />,
        children: [
          { index: true, element: <div>Главная</div> },
          { path: 'catalog', element: <div>Каталог</div> },
        ],
      },
    ],
    {
      initialEntries: [initialEntry],
      future: { v7_startTransition: true, v7_relativeSplatPath: true },
    }
  );

  render(<RouterProvider router={router} />);
}

beforeEach(() => {
  fetchProductSuggestions.mockReset();
  fetchProductSuggestions.mockResolvedValue([
    { key: 'vvgng-ls', mark: 'ВВГнг-LS', count: 12 },
    { key: 'avvg', mark: 'АВВГ', count: 3 },
  ]);
});

describe('MainLayout', () => {
  it('показывает UX-фидбек при ошибке сохранения корзины и даёт закрыть предупреждение', async () => {
    const user = userEvent.setup();
    renderLayout();

    window.dispatchEvent(
      new CustomEvent(STORAGE_WRITE_FAILED_EVENT, {
        detail: { key: 'yuzhural-cart', reason: 'quota' },
      })
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'браузер не дал сохранить корзину'
    );

    await user.click(screen.getByRole('button', { name: 'Понятно' }));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('рендерит поиск в шапке как полноценный combobox с listbox и option', async () => {
    const user = userEvent.setup();
    renderLayout();

    const searchInput = screen.getByRole('combobox', {
      name: 'Поиск по каталогу',
    });

    expect(searchInput).toHaveAttribute('aria-autocomplete', 'list');
    expect(searchInput).toHaveAttribute('id', 'header-search');
    expect(searchInput).toHaveAttribute('type', 'search');
    expect(searchInput).toHaveAttribute(
      'aria-controls',
      'header-search-suggestions'
    );
    expect(searchInput).toHaveAttribute('aria-expanded', 'false');

    await user.type(searchInput, 'В');

    const listbox = await screen.findByRole('listbox', {
      name: 'Подсказки поиска по каталогу',
    });
    const options = within(listbox).getAllByRole('option');

    expect(searchInput).toHaveAttribute('aria-expanded', 'true');
    expect(options).toHaveLength(2);
    expect(options[0]).toHaveTextContent('ВВГнг-LS');

    await user.keyboard('{ArrowDown}');

    expect(options[0]).toHaveAttribute('aria-selected', 'true');
    expect(searchInput).toHaveAttribute('aria-activedescendant', options[0].id);

    await user.keyboard('{ArrowDown}');

    expect(options[1]).toHaveAttribute('aria-selected', 'true');
    expect(searchInput).toHaveAttribute('aria-activedescendant', options[1].id);

    await user.keyboard('{Enter}');

    await waitFor(() => expect(searchInput).toHaveValue('АВВГ'));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('связывает кнопки мобильного меню и каталога с управляемыми панелями', async () => {
    const user = userEvent.setup();
    renderLayout();

    const mobileMenuButton = screen.getByRole('button', {
      name: 'Открыть меню',
    });
    expect(mobileMenuButton).toHaveAttribute(
      'aria-controls',
      'mobile-navigation'
    );
    expect(mobileMenuButton).toHaveAttribute('aria-expanded', 'false');

    await user.click(mobileMenuButton);

    expect(mobileMenuButton).toHaveAttribute('aria-expanded', 'true');
    expect(
      await screen.findByRole('dialog', { name: 'Мобильное меню' })
    ).toHaveAttribute('id', 'mobile-navigation');

    await user.click(
      screen.getAllByRole('button', { name: 'Закрыть меню' })[0]
    );

    const catalogButton = await screen.findByRole('button', {
      name: 'Каталог',
    });
    expect(catalogButton).toHaveAttribute('aria-controls', 'catalog-dropdown');
    expect(catalogButton).toHaveAttribute('aria-expanded', 'false');

    await user.click(catalogButton);

    expect(catalogButton).toHaveAttribute('aria-expanded', 'true');
    expect(document.getElementById('catalog-dropdown')).toBeInTheDocument();
    expect(
      screen.getAllByRole('link', { name: 'Силовой кабель' }).length
    ).toBeGreaterThan(0);
    expect(
      screen.queryByRole('button', { name: 'Силовой кабель' })
    ).not.toBeInTheDocument();
  });
});
