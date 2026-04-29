import MainLayout from '../components/layout/MainLayout';

export function createRouteObjects({
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
        { path: 'favorites', element: <FavoritesPage /> },
        { path: 'contacts', element: <ContactsPage /> },
        { path: 'delivery', element: <DeliveryPage /> },
        { path: 'payment', element: <PaymentPage /> },
        { path: 'about', element: <AboutPage /> },
        { path: '*', element: <NotFoundPage /> },
      ],
    },
  ];
}
