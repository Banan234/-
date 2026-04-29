// @vitest-environment jsdom

import '../test/renderTestSetup.js';
import { MemoryRouter } from 'react-router-dom';
import { render, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import CartPage from './CartPage.jsx';
import FavoritesPage from './FavoritesPage.jsx';

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
});
