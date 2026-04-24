import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import Container from '../ui/Container';
import Modal from '../ui/Modal';
import QuoteForm from '../quote/QuoteForm';
import SiteFooter from './SiteFooter';
import { useCartStore } from '../../store/useCartStore';
import { useFavoritesStore } from '../../store/useFavoritesStore';
import catalogCategoriesData from '../../../data/catalogCategories.json';

const cableSection = catalogCategoriesData.sections.find(
  (section) => section.slug === 'kabel-i-provod'
);

function buildSearchLink(term) {
  return {
    label: term,
    to: `/catalog?search=${encodeURIComponent(term)}`,
  };
}

function buildCategoryMenuItem(category) {
  const uniqueKeywords = Array.from(new Set(category.keywords || []))
    .filter(Boolean)
    .slice(0, 5);

  return {
    title: category.name,
    slug: category.slug,
    links: [
      { label: category.name, to: `/catalog/${category.slug}` },
      ...uniqueKeywords.map(buildSearchLink),
    ],
  };
}

const catalogMenu = [
  ...(cableSection?.categories || []).map(buildCategoryMenuItem),
  {
    title: 'Некабельная продукция',
    slug: 'nekabelnaya-produkciya',
    links: [{ label: 'Некабельная продукция', to: '/catalog/nekabelnaya-produkciya' }],
  },
];

export default function MainLayout() {
  const items = useCartStore((state) => state.items);
  const totalCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const favoritesCount = useFavoritesStore((state) => state.items.length);

  const navigate = useNavigate();
  const location = useLocation();

  const [headerSearch, setHeaderSearch] = useState('');
  const [isQuoteModalOpen, setIsQuoteModalOpen] = useState(false);
  const [isCatalogOpen, setIsCatalogOpen] = useState(false);
  const [isCatalogPinnedOpen, setIsCatalogPinnedOpen] = useState(false);
  const [activeCatalogIndex, setActiveCatalogIndex] = useState(0);
  const [isScrolled, setIsScrolled] = useState(false);
  const isCatalogPage = location.pathname.startsWith('/catalog');
  const catalogCloseTimeoutRef = useRef(null);
  const catalogWrapperRef = useRef(null);
  const activeCatalogGroup = catalogMenu[activeCatalogIndex] || catalogMenu[0];

  useEffect(() => {
    function handleScroll() {
      setIsScrolled(window.scrollY > 48);
    }

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const currentSearch =
      new URLSearchParams(location.search).get('search') || '';

    if (location.pathname === '/catalog') {
      setHeaderSearch(currentSearch);
    } else {
      setHeaderSearch('');
    }
  }, [location.pathname, location.search]);

  useEffect(() => {
    setIsCatalogOpen(false);
    setIsCatalogPinnedOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    function handleOpenQuote() {
      setIsQuoteModalOpen(true);
    }

    window.addEventListener('open-quote-modal', handleOpenQuote);
    return () => window.removeEventListener('open-quote-modal', handleOpenQuote);
  }, []);

  function clearCatalogCloseTimeout() {
    if (catalogCloseTimeoutRef.current) {
      clearTimeout(catalogCloseTimeoutRef.current);
      catalogCloseTimeoutRef.current = null;
    }
  }

  function handleCatalogNavigate(to) {
    clearCatalogCloseTimeout();
    setIsCatalogOpen(false);
    setIsCatalogPinnedOpen(false);
    navigate(to);
  }

  function openCatalogMenu() {
    clearCatalogCloseTimeout();
    setIsCatalogOpen(true);
  }

  function closeCatalogMenu() {
    if (isCatalogPinnedOpen) {
      return;
    }

    clearCatalogCloseTimeout();

    catalogCloseTimeoutRef.current = setTimeout(() => {
      setIsCatalogOpen(false);
      catalogCloseTimeoutRef.current = null;
    }, 140);
  }

  function pinCatalogMenuOpen() {
    clearCatalogCloseTimeout();
    setIsCatalogPinnedOpen(true);
    setIsCatalogOpen(true);
  }

  useEffect(() => {
    function handleClickOutside(event) {
      if (
        catalogWrapperRef.current &&
        !catalogWrapperRef.current.contains(event.target)
      ) {
        clearCatalogCloseTimeout();
        setIsCatalogOpen(false);
        setIsCatalogPinnedOpen(false);
      }
    }

    function handleEscape(event) {
      if (event.key === 'Escape') {
        clearCatalogCloseTimeout();
        setIsCatalogOpen(false);
        setIsCatalogPinnedOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
      clearCatalogCloseTimeout();
    };
  }, []);

  function handleSearchSubmit(event) {
    event.preventDefault();

    const value = headerSearch.trim();
    const params = new URLSearchParams(location.search);

    if (!value) {
      params.delete('search');

      const nextUrl = params.toString()
        ? `/catalog?${params.toString()}`
        : '/catalog';

      navigate(nextUrl);
      return;
    }

    params.set('search', value);

    const nextUrl = `/catalog?${params.toString()}`;
    navigate(nextUrl);
  }

  function handleLogoClick(event) {
    if (location.pathname === '/' && !location.search && !location.hash) {
      event.preventDefault();
      window.location.reload();
    }
  }

  function openQuoteModal() {
    setIsQuoteModalOpen(true);
  }

  return (
    <div>
      <header className={`site-header${isScrolled ? ' site-header--scrolled' : ''}`}>
        <div className="site-header__topbar">
          <Container>
            <div className="site-header__topbar-inner">
              <div className="site-header__topbar-left">
                <span className="topbar-item">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                  Челябинск, ул. Южная, 9А
                </span>
                <span className="topbar-item">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                  Пн–Пт 09:00–18:00
                </span>
              </div>
              <div className="site-header__topbar-right">
                <a href="/price.xls" download className="topbar-phone">
                  Скачать прайс-лист
                </a>
              </div>
            </div>
          </Container>
        </div>

        <div className="site-header__main">
          <Container>
            <div className="site-header__main-inner">
              <Link
                to="/"
                className="site-header__logo"
                onClick={handleLogoClick}
              >
                <img
                  src="/лого%20итог.png"
                  alt="ЮжУралЭлектроКабель"
                  className="site-header__logo-image"
                />
              </Link>

              <div className="site-header__main-right">
                <div className="header-phone-block">
                  <a href="tel:+78005553552" className="header-phone">
                    8 800 555 35 52
                  </a>
                  <a href="mailto:sale@site.ru" className="header-phone-sub">
                    sale@site.ru
                  </a>
                </div>

                <button
                  type="button"
                  className="button-primary header-cta-btn"
                  onClick={openQuoteModal}
                >
                  Заказать звонок
                </button>
              </div>
            </div>
          </Container>
        </div>

        <div className="site-header__nav">
          <Container>
            <div className="site-header__nav-inner">
              <div className="site-header__menu">
                <div
                  ref={catalogWrapperRef}
                  className="catalog-wrapper"
                  onMouseLeave={closeCatalogMenu}
                >
                  <button
                    type="button"
                    className={`catalog-button ${
                      isCatalogPage || isCatalogOpen
                        ? 'catalog-button--active'
                        : ''
                    }`}
                    onMouseEnter={openCatalogMenu}
                    onClick={pinCatalogMenuOpen}
                  >
                    <span className="catalog-button__icon" aria-hidden="true">
                      <span />
                      <span />
                      <span />
                    </span>
                    <span>Каталог</span>
                  </button>

                  {isCatalogOpen && (
                    <>
                      <div
                        className="catalog-hover-bridge"
                        onMouseEnter={openCatalogMenu}
                        onMouseLeave={closeCatalogMenu}
                      />

                      <div
                        className="catalog-dropdown"
                        onMouseEnter={openCatalogMenu}
                        onMouseLeave={closeCatalogMenu}
                      >
                        <div className="catalog-dropdown__sidebar">
                          <div className="catalog-dropdown__sidebar-title">
                            {cableSection?.name || 'Кабель и провод'}
                          </div>
                          {catalogMenu.map((group, index) => (
                            <button
                              key={group.title}
                              type="button"
                              className={`catalog-dropdown__sidebar-item ${
                                activeCatalogIndex === index
                                  ? 'catalog-dropdown__sidebar-item--active'
                                  : ''
                              }`}
                              onMouseEnter={() => setActiveCatalogIndex(index)}
                              onClick={() =>
                                handleCatalogNavigate(
                                  group.links[0]?.to || '/catalog'
                                )
                              }
                            >
                              {group.title}
                            </button>
                          ))}
                        </div>

                        <div className="catalog-dropdown__content">
                          <div className="catalog-dropdown__group">
                            <div className="catalog-dropdown__group-title">
                              {activeCatalogGroup.title}
                            </div>

                            <div className="catalog-dropdown__group-subtitle">
                              Выберите нужную подкатегорию и перейдите в
                              каталог.
                            </div>

                            <div className="catalog-dropdown__links catalog-dropdown__links--wide">
                              {activeCatalogGroup.links.map((link) => (
                                <button
                                  key={link.label}
                                  type="button"
                                  className="catalog-dropdown__link"
                                  onClick={() => handleCatalogNavigate(link.to)}
                                >
                                  {link.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>

                <NavLink
                  to="/delivery"
                  className={({ isActive }) => `nav-link${isActive ? ' nav-link--active' : ''}`}
                >
                  Доставка
                </NavLink>
                <NavLink
                  to="/about"
                  className={({ isActive }) => `nav-link${isActive ? ' nav-link--active' : ''}`}
                >
                  О компании
                </NavLink>
                <NavLink
                  to="/contacts"
                  className={({ isActive }) => `nav-link${isActive ? ' nav-link--active' : ''}`}
                >
                  Контакты
                </NavLink>
              </div>

              <form
                className="site-header__search-inline"
                onSubmit={handleSearchSubmit}
              >
                <input
                  className="site-header__search-input"
                  placeholder="Поиск по каталогу..."
                  value={headerSearch}
                  onChange={(event) => setHeaderSearch(event.target.value)}
                />
                <button type="submit" className="site-header__search-button">
                  Найти
                </button>
              </form>

              <div className="site-header__actions">
                <Link
                  to="/favorites"
                  className="site-header__cart"
                  aria-label="Открыть избранное"
                >
                  <svg
                    className="site-header__cart-icon site-header__cart-icon--svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                  </svg>
                  {favoritesCount > 0 && (
                    <span className="cart-badge">{favoritesCount}</span>
                  )}
                </Link>

                <Link
                  to="/cart"
                  className="site-header__cart"
                  aria-label="Открыть корзину"
                >
                  <svg
                    className="site-header__cart-icon site-header__cart-icon--svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <circle cx="9" cy="21" r="1" />
                    <circle cx="20" cy="21" r="1" />
                    <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
                  </svg>
                  {totalCount > 0 && (
                    <span className="cart-badge">{totalCount}</span>
                  )}
                </Link>
              </div>
            </div>
          </Container>
        </div>
      </header>

      {isCatalogPinnedOpen && (
        <button
          type="button"
          className="catalog-page-lock"
          aria-label="Закрыть каталог"
          onClick={() => {
            clearCatalogCloseTimeout();
            setIsCatalogOpen(false);
            setIsCatalogPinnedOpen(false);
          }}
        />
      )}

      <main>
        <Outlet />
      </main>

      <SiteFooter onOpenQuote={openQuoteModal} />

      <Modal
        isOpen={isQuoteModalOpen}
        onClose={() => setIsQuoteModalOpen(false)}
      >
        <QuoteForm title="Запрос коммерческого предложения" />
      </Modal>
    </div>
  );
}
