import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { CATALOG_MENU } from './catalogMenuData';
import { SITE_PHONE_DISPLAY } from '../../lib/siteConfig';

export default function MobileNav({
  id,
  isOpen,
  favoritesCount,
  totalCount,
  onClose,
  onOpenQuote,
}) {
  useEffect(() => {
    if (!isOpen) return undefined;

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  function handleQuoteClick() {
    onClose();
    onOpenQuote();
  }

  return (
    <div
      id={id}
      className="mobile-nav"
      role="dialog"
      aria-modal="true"
      aria-label="Мобильное меню"
    >
      <button
        type="button"
        className="mobile-nav__backdrop"
        aria-label="Закрыть меню"
        onClick={onClose}
      />

      <div className="mobile-nav__panel">
        <div className="mobile-nav__top">
          <Link to="/" className="mobile-nav__logo" onClick={onClose}>
            <picture>
              <source srcSet="/logo.webp" type="image/webp" />
              <img
                src="/logo.png"
                alt="ЮжУралЭлектроКабель"
                width="600"
                height="160"
                loading="lazy"
                decoding="async"
              />
            </picture>
          </Link>

          <button
            type="button"
            className="mobile-nav__close"
            onClick={onClose}
            aria-label="Закрыть меню"
          >
            ×
          </button>
        </div>

        <div className="mobile-nav__body">
          <div className="mobile-nav__section">
            <div className="mobile-nav__section-title">Каталог</div>
            <div className="mobile-nav__catalog">
              {CATALOG_MENU.map((group) => (
                <details
                  key={group.slug || group.title}
                  className="mobile-nav__catalog-group"
                >
                  <summary>{group.title}</summary>
                  <div className="mobile-nav__catalog-links">
                    {group.links.map((link) => (
                      <Link key={link.to} to={link.to} onClick={onClose}>
                        {link.label}
                      </Link>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          </div>

          <nav className="mobile-nav__section" aria-label="Основная навигация">
            <div className="mobile-nav__section-title">Разделы</div>
            <div className="mobile-nav__links">
              <Link to="/catalog" onClick={onClose}>
                Весь каталог
              </Link>
              <Link to="/delivery" onClick={onClose}>
                Доставка
              </Link>
              <Link to="/payment" onClick={onClose}>
                Оплата
              </Link>
              <Link to="/about" onClick={onClose}>
                О компании
              </Link>
              <Link to="/contacts" onClick={onClose}>
                Контакты
              </Link>
            </div>
          </nav>

          <div className="mobile-nav__quick">
            <Link
              to="/favorites"
              className="mobile-nav__quick-link"
              onClick={onClose}
            >
              Избранное
              {favoritesCount > 0 ? <span>{favoritesCount}</span> : null}
            </Link>
            <Link
              to="/cart"
              className="mobile-nav__quick-link"
              onClick={onClose}
            >
              Корзина
              {totalCount > 0 ? <span>{totalCount}</span> : null}
            </Link>
            <a
              href="/price.xls"
              download
              className="mobile-nav__quick-link"
              onClick={onClose}
            >
              Скачать прайс
              <span>XLS</span>
            </a>
          </div>
        </div>

        <div className="mobile-nav__footer">
          <button
            type="button"
            className="mobile-nav__cta"
            onClick={handleQuoteClick}
          >
            Получить КП
          </button>
          <a href="tel:+78005553552" className="mobile-nav__phone">
            {SITE_PHONE_DISPLAY}
          </a>
        </div>
      </div>
    </div>
  );
}
