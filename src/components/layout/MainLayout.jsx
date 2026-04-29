import {
  Link,
  NavLink,
  Outlet,
  useLocation,
} from 'react-router-dom';
import { Suspense, lazy, useEffect, useState } from 'react';
import Container from '../ui/Container';
import Modal from '../ui/Modal';
import SiteFooter from './SiteFooter';
import { useCartStore } from '../../store/useCartStore';
import { useFavoritesStore } from '../../store/useFavoritesStore';
import { trackEvent } from '../../lib/analytics';
import { usePageviewTracking } from '../../hooks/usePageviewTracking';
import { STORAGE_WRITE_FAILED_EVENT } from '../../lib/browserStorage';

const MOBILE_NAV_ID = 'mobile-navigation';

const LazyHeroLeadForm = lazy(() => import('../home/HeroLeadForm'));
const LazyQuoteForm = lazy(() => import('../quote/QuoteForm'));
const LazyHeaderCatalogMenu = lazy(() => import('./HeaderCatalogMenu'));
const LazyHeaderSearch = lazy(() => import('./HeaderSearch'));
const LazyMobileNav = lazy(() => import('./MobileNav'));

function ModalFormFallback() {
  return (
    <div className="route-fallback" aria-busy="true" aria-live="polite">
      <span className="route-fallback__spinner" aria-hidden="true" />
      <span className="route-fallback__text">Загружаем форму...</span>
    </div>
  );
}

function CatalogButtonFallback() {
  return (
    <button
      type="button"
      className="catalog-button"
      aria-controls="catalog-dropdown"
      aria-expanded="false"
    >
      <span className="catalog-button__icon" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      <span>Каталог</span>
    </button>
  );
}

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

function HeaderSearchFallback() {
  return (
    <form className="site-header__search-inline" aria-hidden="true">
      <div className="site-header__search-field">
        <div className="site-header__search-input" />
      </div>
      <button type="button" className="site-header__search-button" tabIndex={-1}>
        Найти
      </button>
    </form>
  );
}

export default function MainLayout() {
  const items = useCartStore((state) => state.items);
  const totalCount = items.length;
  const favoritesCount = useFavoritesStore((state) => state.items.length);

  const location = useLocation();
  usePageviewTracking();

  const [isLeadModalOpen, setIsLeadModalOpen] = useState(false);
  const [isQuoteModalOpen, setIsQuoteModalOpen] = useState(false);
  const [leadModalOptions, setLeadModalOptions] = useState({});
  const [quoteModalOptions, setQuoteModalOptions] = useState({});
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [storageWarning, setStorageWarning] = useState(null);

  useEffect(() => {
    function handleScroll() {
      setIsScrolled(window.scrollY > 48);
    }

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
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
                <picture>
                  <source srcSet="/logo.webp" type="image/webp" />
                  <img
                    src="/logo.png"
                    alt="ЮжУралЭлектроКабель"
                    className="site-header__logo-image"
                    width="600"
                    height="160"
                    loading="eager"
                    decoding="async"
                  />
                </picture>
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
                  aria-controls={MOBILE_NAV_ID}
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
                <Suspense fallback={<CatalogButtonFallback />}>
                  <LazyHeaderCatalogMenu />
                </Suspense>

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

              <Suspense fallback={<HeaderSearchFallback />}>
                <LazyHeaderSearch />
              </Suspense>

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

      {isMobileNavOpen ? (
        <Suspense fallback={null}>
          <LazyMobileNav
            id={MOBILE_NAV_ID}
            isOpen={isMobileNavOpen}
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
        </Suspense>
      ) : null}

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
        <Suspense fallback={<ModalFormFallback />}>
          <LazyHeroLeadForm
            title={leadModalOptions.title || 'Получить КП или заказать звонок'}
            subtitle={
              leadModalOptions.subtitle ||
              'Оставьте телефон и комментарий — менеджер свяжется с вами.'
            }
            submitLabel={leadModalOptions.submitLabel || 'Отправить заявку'}
            defaultComment={leadModalOptions.comment || ''}
            source={leadModalOptions.source || 'Короткая форма'}
          />
        </Suspense>
      </Modal>

      <Modal
        isOpen={isQuoteModalOpen}
        onClose={() => {
          setIsQuoteModalOpen(false);
          setQuoteModalOptions({});
        }}
      >
        <Suspense fallback={<ModalFormFallback />}>
          <LazyQuoteForm
            title={
              quoteModalOptions.title || 'Запрос коммерческого предложения'
            }
            description={quoteModalOptions.description}
            itemsOverride={quoteModalOptions.items || null}
          />
        </Suspense>
      </Modal>
    </div>
  );
}
