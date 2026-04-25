import { lazy } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import MainLayout from '../components/layout/MainLayout';

// Все страницы — отдельные чанки. На первый paint грузится только тот,
// который соответствует текущему маршруту.
const HomePage = lazy(() => import('../pages/HomePage'));
const CatalogPage = lazy(() => import('../pages/CatalogPage'));
const SubcategoryPage = lazy(() => import('../pages/SubcategoryPage'));
const ProductPage = lazy(() => import('../pages/ProductPage'));
const CartPage = lazy(() => import('../pages/CartPage'));
const ContactsPage = lazy(() => import('../pages/ContactsPage'));
const FavoritesPage = lazy(() => import('../pages/FavoritesPage'));
const DeliveryPage = lazy(() => import('../pages/DeliveryPage'));
const PaymentPage = lazy(() => import('../pages/PaymentPage'));
const AboutPage = lazy(() => import('../pages/AboutPage'));

export const router = createBrowserRouter([
  {
    path: '/',
    element: <MainLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'catalog', element: <CatalogPage /> },
      { path: 'catalog/:slug', element: <SubcategoryPage /> },
      { path: 'product/:slug', element: <ProductPage /> },
      { path: 'cart', element: <CartPage /> },
      { path: 'favorites', element: <FavoritesPage /> },
      { path: 'contacts', element: <ContactsPage /> },
      { path: 'delivery', element: <DeliveryPage /> },
      { path: 'payment', element: <PaymentPage /> },
      { path: 'about', element: <AboutPage /> },
    ],
  },
]);
