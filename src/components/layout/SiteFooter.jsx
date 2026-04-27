import { Link } from 'react-router-dom';
import Container from '../ui/Container';

export default function SiteFooter({ onOpenQuote }) {
  return (
    <footer className="site-footer">
      <Container>
        <div className="site-footer__cta-block">
          <div className="site-footer__cta-copy">
            <div className="site-footer__eyebrow">Готовы к сотрудничеству?</div>
            <h2 className="site-footer__cta-title">
              Нужно коммерческое предложение?
            </h2>
            <p className="site-footer__cta-text">
              Отправьте список нужных марок — подготовим КП с актуальными ценами
              в течение дня.
            </p>
          </div>

          <div className="site-footer__cta-side">
            <button
              type="button"
              className="site-footer__hero-cta"
              onClick={onOpenQuote}
            >
              Получить КП за 15 минут
            </button>

            <div
              className="site-footer__quick-actions"
              aria-label="Быстрые контакты"
            >
              <div className="site-footer__quick-actions-label">
                или свяжитесь удобным способом:
              </div>
              <div className="site-footer__quick-links">
                <a href="tel:+78005553552" className="site-footer__quick-link">
                  8 800 555 35 52
                </a>
                <span className="site-footer__quick-divider" aria-hidden="true">
                  ·
                </span>
                <a
                  href="https://t.me/ocnuz"
                  className="site-footer__quick-link"
                  target="_blank"
                  rel="noreferrer"
                >
                  Telegram
                </a>
                <span className="site-footer__quick-divider" aria-hidden="true">
                  ·
                </span>
                <a
                  href="https://wa.me/79227230010"
                  className="site-footer__quick-link"
                  target="_blank"
                  rel="noreferrer"
                >
                  WhatsApp
                </a>
              </div>
            </div>
          </div>
        </div>

        <div className="site-footer__top">
          <div className="site-footer__column">
            <h3 className="site-footer__title">Каталог</h3>
            <div className="site-footer__links">
              <Link to="/catalog?category=Силовой%20кабель">
                Силовой кабель
              </Link>
              <Link to="/catalog?category=Контрольный%20кабель">
                Контрольный кабель
              </Link>
              <Link to="/catalog?category=Кабели%20связи">Кабели связи</Link>
              <Link to="/catalog?category=Гибкий%20кабель">Гибкий кабель</Link>
              <Link to="/catalog">Весь каталог →</Link>
            </div>
          </div>

          <div className="site-footer__column">
            <h3 className="site-footer__title">Как мы работаем</h3>
            <div className="site-footer__links">
              <button
                type="button"
                className="site-footer__link-button"
                onClick={onOpenQuote}
              >
                Как оформить заявку
              </button>
              <Link to="/payment">Условия оплаты</Link>
              <Link to="/delivery">Доставка</Link>
              <span className="site-footer__step">Гарантии и документы</span>
            </div>
          </div>

          <div className="site-footer__column">
            <h3 className="site-footer__title">Компания</h3>
            <div className="site-footer__links">
              <Link to="/about">О компании</Link>
              <Link to="/delivery">Доставка</Link>
              <Link to="/payment">Оплата</Link>
              <Link to="/contacts">Контакты</Link>
            </div>
          </div>

          <div className="site-footer__contacts">
            <h3 className="site-footer__title">Контакты</h3>
            <a href="tel:+78005553552" className="site-footer__phone">
              8 800 555 35 52
            </a>
            <a href="mailto:sale@site.ru" className="site-footer__mail">
              sale@site.ru
            </a>
            <div className="site-footer__text">
              Челябинск, ул. Южная, 9А
              <br />
              Пн–Пт: 09:00–18:00
            </div>
          </div>
        </div>

        <div className="site-footer__legal">
          © 2026 ЮжУралЭлектроКабель. Информация на сайте носит справочный
          характер и не является публичной офертой.
        </div>
      </Container>
    </footer>
  );
}
