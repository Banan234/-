import {
  Link,
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import { Suspense, useEffect, useRef, useState } from 'react';
import Container from '../ui/Container';
import Modal from '../ui/Modal';
import HeroLeadForm from '../home/HeroLeadForm';
import QuoteForm from '../quote/QuoteForm';
import SiteFooter from './SiteFooter';
import MobileNav from './MobileNav';
import { fetchProductSuggestions } from '../../lib/productsApi';
import { captureException } from '../../lib/errorTracking';
import { useCartStore } from '../../store/useCartStore';
import { useFavoritesStore } from '../../store/useFavoritesStore';
import { trackEvent } from '../../lib/analytics';
import { usePageviewTracking } from '../../hooks/usePageviewTracking';
import { STORAGE_WRITE_FAILED_EVENT } from '../../lib/browserStorage';
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
    links: [
      { label: 'Некабельная продукция', to: '/catalog/nekabelnaya-produkciya' },
    ],
  },
];
const SEARCH_SUGGESTIONS_LIMIT = 7;

function buildStorageWarningMessage(key) {
  if (key === 'yuzhural-cart') {
    return 'Список для КП изменён только на этом экране: браузер не дал сохранить корзину. Уменьшите список или очистите место в браузере.';
  }

  if (key === 'yuzhural-favorites') {
    return 'Избранное изменено только на этом экране: браузер не дал сохранить список. Освободите место в браузере, чтобы изменения не пропали после перезагрузки.';
  }

  if (key === 'yuzhural-quote-form') {
    return 'Черновик формы не сохранился в браузере. Отправьте заявку сейчас или освободите место в браузере.';
  }

  return 'Браузер не дал сохранить изменения локально. Они видны сейчас, но могут пропасть после перезагрузки страницы.';
}

function normalizeSearchSuggestionKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^0-9a-zа-я]+/g, '');
}

function formatPositionCount(count) {
  const lastTwo = count % 100;
  const last = count % 10;

  if (lastTwo >= 11 && lastTwo <= 14) {
    return `${count} позиций`;
  }

  if (last === 1) {
    return `${count} позиция`;
  }

  if (last >= 2 && last <= 4) {
    return `${count} позиции`;
  }

  return `${count} позиций`;
}

export default function MainLayout() {
  const items = useCartStore((state) => state.items);
  const totalCount = items.length;
  const favoritesCount = useFavoritesStore((state) => state.items.length);

  const navigate = useNavigate();
  const location = useLocation();
  usePageviewTracking();

  const [headerSearch, setHeaderSearch] = useState('');
  const [isLeadModalOpen, setIsLeadModalOpen] = useState(false);
  const [isQuoteModalOpen, setIsQuoteModalOpen] = useState(false);
  const [leadModalOptions, setLeadModalOptions] = useState({});
  const [quoteModalOptions, setQuoteModalOptions] = useState({});
  const [searchSuggestions, setSearchSuggestions] = useState([]);
  const [isSearchCatalogLoading, setIsSearchCatalogLoading] = useState(false);
  const [isSearchSuggestionsOpen, setIsSearchSuggestionsOpen] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isCatalogOpen, setIsCatalogOpen] = useState(false);
  const [isCatalogPinnedOpen, setIsCatalogPinnedOpen] = useState(false);
  const [activeCatalogIndex, setActiveCatalogIndex] = useState(0);
  const [isScrolled, setIsScrolled] = useState(false);
  const [storageWarning, setStorageWarning] = useState(null);
  const isCatalogPage = location.pathname.startsWith('/catalog');
  const catalogCloseTimeoutRef = useRef(null);
  const catalogWrapperRef = useRef(null);
  const searchLoadControllerRef = useRef(null);
  const activeCatalogGroup = catalogMenu[activeCatalogIndex] || catalogMenu[0];
  const normalizedHeaderSearch = normalizeSearchSuggestionKey(headerSearch);
  const shouldShowSearchSuggestions =
    isSearchSuggestionsOpen &&
    normalizedHeaderSearch &&
    (isSearchCatalogLoading || searchSuggestions.length > 0);

  useEffect(() => {
    function handleScroll() {
      setIsScrolled(window.scrollY > 48);
    }

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    return () => {
      searchLoadControllerRef.current?.abort();
    };
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
    setIsMobileNavOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    function handleOpenLead(event) {
      setLeadModalOptions(event.detail || {});
      setIsLeadModalOpen(true);
      trackEvent('quote-open', {
        source: event.detail?.source || event.type || 'unknown',
        kind: 'lead',
      });
    }

    function handleOpenQuote(event) {
      setQuoteModalOptions(event.detail || {});
      setIsQuoteModalOpen(true);
      trackEvent('quote-open', {
        source: event.detail?.source || event.type || 'cart',
        kind: 'quote',
      });
    }

    window.addEventListener('open-lead-modal', handleOpenLead);
    window.addEventListener('open-quote-modal', handleOpenLead);
    window.addEventListener('open-cart-quote-modal', handleOpenQuote);

    return () => {
      window.removeEventListener('open-lead-modal', handleOpenLead);
      window.removeEventListener('open-quote-modal', handleOpenLead);
      window.removeEventListener('open-cart-quote-modal', handleOpenQuote);
    };
  }, []);

  useEffect(() => {
    function handleStorageWriteFailed(event) {
      const key = event.detail?.key || '';
      setStorageWarning({
        key,
        message: buildStorageWarningMessage(key),
      });
    }

    window.addEventListener(
      STORAGE_WRITE_FAILED_EVENT,
      handleStorageWriteFailed
    );

    return () => {
      window.removeEventListener(
        STORAGE_WRITE_FAILED_EVENT,
        handleStorageWriteFailed
      );
    };
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
    setIsSearchSuggestionsOpen(false);
    const params = new URLSearchParams(location.search);

    if (value) {
      trackEvent('search-submit', { query: value, source: 'header' });
    }

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

  function loadSearchSuggestions(value) {
    const search = value.trim();

    if (!search) {
      searchLoadControllerRef.current?.abort();
      searchLoadControllerRef.current = null;
      setSearchSuggestions([]);
      setIsSearchCatalogLoading(false);
      return;
    }

    searchLoadControllerRef.current?.abort();
    const controller = new AbortController();
    searchLoadControllerRef.current = controller;
    setIsSearchCatalogLoading(true);

    fetchProductSuggestions(search, SEARCH_SUGGESTIONS_LIMIT, controller.signal)
      .then((items) => {
        setSearchSuggestions(Array.isArray(items) ? items : []);
      })
      .catch((error) => {
        if (error.name !== 'AbortError') {
          captureException(error, { source: 'MainLayout.searchSuggestions' });
          setSearchSuggestions([]);
        }
      })
      .finally(() => {
        if (searchLoadControllerRef.current === controller) {
          searchLoadControllerRef.current = null;
          setIsSearchCatalogLoading(false);
        }
      });
  }

  function handleSearchInputChange(event) {
    const value = event.target.value;
    setHeaderSearch(value);
    setIsSearchSuggestionsOpen(true);
    loadSearchSuggestions(value);
  }

  function handleSearchSuggestionClick(mark) {
    setHeaderSearch(mark);
    setIsSearchSuggestionsOpen(false);
    trackEvent('search-submit', { query: mark, source: 'header-suggestion' });
    navigate(`/catalog?search=${encodeURIComponent(mark)}`);
  }

  function handleLogoClick(event) {
    if (location.pathname === '/' && !location.search && !location.hash) {
      event.preventDefault();
      window.location.reload();
    }
  }

  function openLeadModal(options = {}) {
    setLeadModalOptions(options);
    setIsLeadModalOpen(true);
    trackEvent('quote-open', {
      source: options.source || 'lead',
      kind: 'lead',
    });
  }

  return (
    <div>
      <header
        className={`site-header${isScrolled ? ' site-header--scrolled' : ''}`}
      >
        <div className="site-header__topbar">
          <Container>
            <div className="site-header__topbar-inner">
              <div className="site-header__topbar-left">
                <span className="topbar-item">
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                  Челябинск, ул. Южная, 9А
                </span>
                <span className="topbar-item">
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                  Пн–Пт 09:00–18:00
                </span>
              </div>
              <div className="site-header__topbar-right">
                <a href="/price.xls" download className="topbar-download">
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M12 3v12" />
                    <path d="m7 10 5 5 5-5" />
                    <path d="M5 21h14" />
                  </svg>
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
                  src="/logo.png"
                  alt="ЮжУралЭлектроКабель"
                  className="site-header__logo-image"
                  width="600"
                  height="160"
                  loading="eager"
                  decoding="async"
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
                  onClick={() =>
                    openLeadModal({
                      title: 'Заказать звонок',
                      subtitle:
                        'Оставьте телефон и комментарий — менеджер перезвонит в рабочее время.',
                      submitLabel: 'Заказать звонок',
                      source: 'Кнопка в хедере',
                    })
                  }
                >
                  Заказать звонок
                </button>

                <button
                  type="button"
                  className="mobile-menu-button"
                  onClick={() => setIsMobileNavOpen(true)}
                  aria-label="Открыть меню"
                  aria-expanded={isMobileNavOpen}
                >
                  <span />
                  <span />
                  <span />
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
                  className={({ isActive }) =>
                    `nav-link${isActive ? ' nav-link--active' : ''}`
                  }
                >
                  Доставка
                </NavLink>
                <NavLink
                  to="/about"
                  className={({ isActive }) =>
                    `nav-link${isActive ? ' nav-link--active' : ''}`
                  }
                >
                  О компании
                </NavLink>
                <NavLink
                  to="/contacts"
                  className={({ isActive }) =>
                    `nav-link${isActive ? ' nav-link--active' : ''}`
                  }
                >
                  Контакты
                </NavLink>
              </div>

              <form
                className="site-header__search-inline"
                onSubmit={handleSearchSubmit}
              >
                <div className="site-header__search-field">
                  <input
                    className="site-header__search-input"
                    placeholder="Поиск по каталогу..."
                    value={headerSearch}
                    onChange={handleSearchInputChange}
                    onFocus={() => {
                      setIsSearchSuggestionsOpen(true);
                      if (headerSearch.trim()) {
                        loadSearchSuggestions(headerSearch);
                      }
                    }}
                    onBlur={() => {
                      window.setTimeout(() => {
                        setIsSearchSuggestionsOpen(false);
                      }, 120);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') {
                        setIsSearchSuggestionsOpen(false);
                      }
                    }}
                    aria-autocomplete="list"
                    aria-expanded={Boolean(shouldShowSearchSuggestions)}
                  />

                  {shouldShowSearchSuggestions ? (
                    <div className="site-header__search-suggestions">
                      {isSearchCatalogLoading &&
                      searchSuggestions.length === 0 ? (
                        <div className="site-header__search-suggestion-status">
                          Загружаем марки...
                        </div>
                      ) : (
                        searchSuggestions.map((suggestion) => (
                          <button
                            key={suggestion.key}
                            type="button"
                            className="site-header__search-suggestion"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() =>
                              handleSearchSuggestionClick(suggestion.mark)
                            }
                          >
                            <span className="site-header__search-suggestion-mark">
                              {suggestion.mark}
                            </span>
                            <span className="site-header__search-suggestion-count">
                              {formatPositionCount(suggestion.count)}
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  ) : null}
                </div>
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

      {storageWarning ? (
        <div className="storage-warning" role="alert">
          <Container>
            <div className="storage-warning__inner">
              <span className="storage-warning__text">
                {storageWarning.message}
              </span>
              <button
                type="button"
                className="storage-warning__close"
                onClick={() => setStorageWarning(null)}
              >
                Понятно
              </button>
            </div>
          </Container>
        </div>
      ) : null}

      <MobileNav
        isOpen={isMobileNavOpen}
        catalogMenu={catalogMenu}
        favoritesCount={favoritesCount}
        totalCount={totalCount}
        onClose={() => setIsMobileNavOpen(false)}
        onOpenQuote={() =>
          openLeadModal({
            title: 'Получить КП',
            subtitle:
              'Оставьте телефон и список нужных позиций — подготовим коммерческое предложение.',
            submitLabel: 'Получить КП',
            source: 'Мобильное меню',
          })
        }
      />

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
        <Suspense
          fallback={
            <div className="route-fallback" aria-busy="true" aria-live="polite">
              <span className="route-fallback__spinner" aria-hidden="true" />
              <span className="route-fallback__text">
                Загружаем страницу...
              </span>
            </div>
          }
        >
          <Outlet />
        </Suspense>
      </main>

      <SiteFooter
        onOpenQuote={() =>
          openLeadModal({
            title: 'Получить КП',
            subtitle:
              'Оставьте телефон и список нужных позиций — подготовим коммерческое предложение.',
            submitLabel: 'Получить КП',
            source: 'CTA в футере',
          })
        }
      />

      <Modal
        isOpen={isLeadModalOpen}
        onClose={() => setIsLeadModalOpen(false)}
        windowClassName="modal-window--lead"
      >
        <HeroLeadForm
          title={leadModalOptions.title || 'Получить КП или заказать звонок'}
          subtitle={
            leadModalOptions.subtitle ||
            'Оставьте телефон и комментарий — менеджер свяжется с вами.'
          }
          submitLabel={leadModalOptions.submitLabel || 'Отправить заявку'}
          defaultComment={leadModalOptions.comment || ''}
          source={leadModalOptions.source || 'Короткая форма'}
        />
      </Modal>

      <Modal
        isOpen={isQuoteModalOpen}
        onClose={() => {
          setIsQuoteModalOpen(false);
          setQuoteModalOptions({});
        }}
      >
        <QuoteForm
          title={quoteModalOptions.title || 'Запрос коммерческого предложения'}
          description={quoteModalOptions.description}
          itemsOverride={quoteModalOptions.items || null}
        />
      </Modal>
    </div>
  );
}
