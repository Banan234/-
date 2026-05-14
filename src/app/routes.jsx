// Файл собирает общие route objects, layout, SEO-хуки и scroll-поведение для всех страниц.

import MainLayout from '../components/layout/MainLayout';

export function createRouteObjects({
  HomePage,
  CatalogPage,
  ProductPage,
  CartPage,
  ContactsPage,
  DeliveryPage,
  PaymentPage,
  PrivacyPage,
  AboutPage,
  NotFoundPage,
}) {
  return [
    {
      path: '/',
      element: <MainLayout />,
      children: [
        { index: true, element: <HomePage /> },
        { path: 'catalog/:slug?', element: <CatalogPage /> },
        { path: 'product/:slug', element: <ProductPage /> },
        { path: 'cart', element: <CartPage /> },
        { path: 'contacts', element: <ContactsPage /> },
        { path: 'delivery', element: <DeliveryPage /> },
        { path: 'payment', element: <PaymentPage /> },
        { path: 'privacy', element: <PrivacyPage /> },
        { path: 'about', element: <AboutPage /> },
        { path: '*', element: <NotFoundPage /> },
      ],
    },
  ];
}
