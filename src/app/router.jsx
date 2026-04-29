import { lazy } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import { createRouteObjects } from './routes';
import HomePage from '../pages/HomePage';

// Все страницы — отдельные чанки. На первый paint грузится только тот,
// который соответствует текущему маршруту. Главная загружается синхронно,
// чтобы убрать route waterfall для первого визита на /.
const CatalogPage = lazy(() => import('../pages/CatalogPage'));
const ProductPage = lazy(() => import('../pages/ProductPage'));
const CartPage = lazy(() => import('../pages/CartPage'));
const ContactsPage = lazy(() => import('../pages/ContactsPage'));
const FavoritesPage = lazy(() => import('../pages/FavoritesPage'));
const DeliveryPage = lazy(() => import('../pages/DeliveryPage'));
const PaymentPage = lazy(() => import('../pages/PaymentPage'));
const AboutPage = lazy(() => import('../pages/AboutPage'));
const NotFoundPage = lazy(() => import('../pages/NotFoundPage'));

export const router = createBrowserRouter(
  createRouteObjects({
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
  }),
  {
    future: {
      v7_relativeSplatPath: true,
    },
  }
);
