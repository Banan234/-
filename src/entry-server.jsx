import { StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { createRouteObjects } from './app/routes';
import { ErrorBoundary } from './components/ErrorBoundary';
import { PrerenderDataProvider } from './lib/prerenderData';
import HomePage from './pages/HomePage';
import CatalogPage from './pages/CatalogPage';
import ProductPage from './pages/ProductPage';
import CartPage from './pages/CartPage';
import ContactsPage from './pages/ContactsPage';
import FavoritesPage from './pages/FavoritesPage';
import DeliveryPage from './pages/DeliveryPage';
import PaymentPage from './pages/PaymentPage';
import AboutPage from './pages/AboutPage';
import NotFoundPage from './pages/NotFoundPage';
import './styles/global.css';

const routes = createRouteObjects({
  HomePage,
  CatalogPage,
  ProductPage,
  CartPage,
  ContactsPage,
  FavoritesPage,
  DeliveryPage,
  PaymentPage,
  AboutPage,
  NotFoundPage,
});

export function render(url, { prerenderData = {} } = {}) {
  const router = createMemoryRouter(routes, {
    initialEntries: [url],
    future: {
      v7_relativeSplatPath: true,
    },
  });

  return renderToString(
    <StrictMode>
      <ErrorBoundary>
        <PrerenderDataProvider data={prerenderData}>
          <RouterProvider
            router={router}
            future={{ v7_startTransition: true }}
          />
        </PrerenderDataProvider>
      </ErrorBoundary>
    </StrictMode>
  );
}
