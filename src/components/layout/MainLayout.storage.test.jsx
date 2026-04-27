// @vitest-environment jsdom

import '../../test/renderTestSetup.js';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import MainLayout from './MainLayout.jsx';
import { STORAGE_WRITE_FAILED_EVENT } from '../../lib/browserStorage.js';

function renderLayout() {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <MainLayout />,
        children: [{ index: true, element: <div>Главная</div> }],
      },
    ],
    {
      initialEntries: ['/'],
      future: { v7_startTransition: true, v7_relativeSplatPath: true },
    }
  );

  render(<RouterProvider router={router} />);
}

describe('MainLayout storage warning', () => {
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
});
