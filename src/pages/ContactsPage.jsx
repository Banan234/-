import { Suspense, lazy } from 'react';
import Container from '../components/ui/Container';
import { useSEO } from '../hooks/useSEO';

const LazyHeroLeadForm = lazy(() => import('../components/home/HeroLeadForm'));

function ContactFormFallback() {
  return (
    <div className="hero-lead-card hero-lead-card--loading" aria-busy="true">
      <div className="hero-lead-card__head">
        <h2 className="hero-lead-card__title">Напишите нам</h2>
        <p className="hero-lead-card__subtitle">Загружаем форму...</p>
      </div>
    </div>
  );
}

export default function ContactsPage() {
  useSEO({
    title: 'Контакты',
    description:
      'Контакты ЮжУралЭлектроКабель: телефон 8 800 555 35 52, email sale@site.ru. Адрес: г. Челябинск, ул. Южная, 9А. Пн–Пт 09:00–18:00.',
  });

  return (
    <>
      <section className="section">
        <Container>
          <div className="contacts-page__hero">
            <div>
              <h1 className="page-title">Контакты</h1>
              <p className="page-subtitle">
                Свяжитесь с нами по вопросам подбора кабеля, расчета поставки,
                коммерческих предложений и сотрудничества.
              </p>
            </div>

            <div className="contacts-page__hero-card">
              <div className="contacts-page__hero-label">Основной телефон</div>
              <a href="tel:+78005553552" className="contacts-page__hero-phone">
                8 800 555 35 52
              </a>

              <div className="contacts-page__hero-meta">
                <a
                  href="mailto:sale@site.ru"
                  className="contacts-page__hero-mail"
                >
                  sale@site.ru
                </a>
                <span>Пн–Пт 09:00–18:00</span>
                <span>Челябинск</span>
              </div>
            </div>
          </div>
        </Container>
      </section>

      <section className="section section--soft">
        <Container>
          <div className="section-head">
            <h2 className="section-title section-title--left">
              Как с нами связаться
            </h2>
          </div>

          <div className="contacts-grid">
            <article className="contact-card">
              <div className="contact-card__title">Отдел продаж</div>
              <div className="contact-card__text">
                Подбор продукции, наличие, цены, коммерческие предложения.
              </div>
              <a href="tel:+78005553552" className="contact-card__link">
                8 800 555 35 52
              </a>
              <a href="mailto:sale@site.ru" className="contact-card__link">
                sale@site.ru
              </a>
            </article>

            <article className="contact-card">
              <div className="contact-card__title">Общие вопросы</div>
              <div className="contact-card__text">
                Вопросы по работе компании, условиям поставки и документам.
              </div>
              <a href="mailto:info@site.ru" className="contact-card__link">
                info@site.ru
              </a>
              <div className="contact-card__meta">Пн–Пт 09:00–18:00</div>
            </article>

            <article className="contact-card">
              <div className="contact-card__title">Сотрудничество</div>
              <div className="contact-card__text">
                Партнерство, оптовые условия, снабжение объектов.
              </div>
              <a href="mailto:partner@site.ru" className="contact-card__link">
                partner@site.ru
              </a>
              <div className="contact-card__meta">Ответ в рабочее время</div>
            </article>
          </div>
        </Container>
      </section>

      <section className="section">
        <Container>
          <div className="contacts-layout">
            <div className="contacts-layout__main">
              <div className="contacts-info-card">
                <h2 className="contacts-info-card__title">Адрес и реквизиты</h2>

                <div className="contacts-info-list">
                  <div className="contacts-info-row">
                    <span>Город</span>
                    <strong>Челябинск</strong>
                  </div>

                  <div className="contacts-info-row">
                    <span>Адрес</span>
                    <strong>г. Челябинск, ул. Примерная, д. 10</strong>
                  </div>

                  <div className="contacts-info-row">
                    <span>Режим работы</span>
                    <strong>Пн–Пт 09:00–18:00</strong>
                  </div>

                  <div className="contacts-info-row">
                    <span>ООО</span>
                    <strong>ЮжУралЭлектроКабель</strong>
                  </div>

                  <div className="contacts-info-row">
                    <span>ИНН</span>
                    <strong>0000000000</strong>
                  </div>

                  <div className="contacts-info-row">
                    <span>ОГРН</span>
                    <strong>0000000000000</strong>
                  </div>
                </div>
              </div>

              <div className="contacts-map-card">
                <div className="contacts-map-card__title">Как нас найти</div>
                <div className="contacts-map-placeholder">
                  <div>
                    <svg
                      width="32"
                      height="32"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{ marginBottom: '12px', color: '#2f8fe8' }}
                      aria-hidden="true"
                    >
                      <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z" />
                      <circle cx="12" cy="10" r="3" />
                    </svg>
                    <div
                      style={{
                        fontWeight: 700,
                        fontSize: '16px',
                        color: '#0a1628',
                        marginBottom: '6px',
                      }}
                    >
                      г. Челябинск, ул. Южная, 9А
                    </div>
                    <div style={{ fontSize: '14px', color: '#5a6f87' }}>
                      Режим работы: Пн–Пт 09:00–18:00
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="contacts-layout__side">
              <Suspense fallback={<ContactFormFallback />}>
                <LazyHeroLeadForm
                  title="Напишите нам"
                  subtitle="Оставьте телефон и вопрос — ответим в рабочее время."
                  submitLabel="Отправить"
                  source="Страница контактов"
                />
              </Suspense>
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}
