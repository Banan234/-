import { createBrowserRouter } from 'react-router-dom';
import MainLayout from '../components/layout/MainLayout';
import HomePage from '../pages/HomePage';
import CatalogPage from '../pages/CatalogPage';
import SubcategoryPage from '../pages/SubcategoryPage';
import ProductPage from '../pages/ProductPage';
import CartPage from '../pages/CartPage';
import ContactsPage from '../pages/ContactsPage';
import FavoritesPage from '../pages/FavoritesPage';
import DeliveryPage from '../pages/DeliveryPage';
import PaymentPage from '../pages/PaymentPage';
import AboutPage from '../pages/AboutPage';

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
