import Container from '../components/ui/Container';
import HeroLeadForm from '../components/home/HeroLeadForm';
import { useSEO } from '../hooks/useSEO';
import {
  SITE_ADDRESS,
  SITE_ADDRESS_DISPLAY,
  SITE_CITY_DISPLAY,
  SITE_EMAIL,
  SITE_EMAIL_HREF,
  SITE_PHONE_DISPLAY,
  SITE_PHONE_HREF,
  SITE_REQUISITES,
  SITE_WORKING_HOURS_DISPLAY,
} from '../lib/siteConfig';
import '../styles/pages/content.css';

export default function ContactsPage() {
  useSEO({
    title: 'Контакты',
    description: `Контакты ЮжУралЭлектроКабель: телефон ${SITE_PHONE_DISPLAY}, email ${SITE_EMAIL}. Адрес: ${SITE_ADDRESS_DISPLAY}. ${SITE_WORKING_HOURS_DISPLAY}.`,
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
              <a href={SITE_PHONE_HREF} className="contacts-page__hero-phone">
                {SITE_PHONE_DISPLAY}
              </a>

              <div className="contacts-page__hero-meta">
                <a href={SITE_EMAIL_HREF} className="contacts-page__hero-mail">
                  {SITE_EMAIL}
                </a>
                <span>{SITE_WORKING_HOURS_DISPLAY}</span>
                <span>{SITE_ADDRESS.addressLocality}</span>
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
              <a href={SITE_PHONE_HREF} className="contact-card__link">
                {SITE_PHONE_DISPLAY}
              </a>
              <a href={SITE_EMAIL_HREF} className="contact-card__link">
                {SITE_EMAIL}
              </a>
            </article>

            <article className="contact-card">
              <div className="contact-card__title">Общие вопросы</div>
              <div className="contact-card__text">
                Вопросы по работе компании, условиям поставки и документам.
              </div>
              <a href={SITE_EMAIL_HREF} className="contact-card__link">
                {SITE_EMAIL}
              </a>
              <div className="contact-card__meta">
                {SITE_WORKING_HOURS_DISPLAY}
              </div>
            </article>

            <article className="contact-card">
              <div className="contact-card__title">Сотрудничество</div>
              <div className="contact-card__text">
                Партнерство, оптовые условия, снабжение объектов.
              </div>
              <a href={SITE_EMAIL_HREF} className="contact-card__link">
                {SITE_EMAIL}
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
                    <strong>{SITE_CITY_DISPLAY}</strong>
                  </div>

                  <div className="contacts-info-row">
                    <span>Адрес</span>
                    <strong>{SITE_ADDRESS_DISPLAY}</strong>
                  </div>

                  <div className="contacts-info-row">
                    <span>Режим работы</span>
                    <strong>{SITE_WORKING_HOURS_DISPLAY}</strong>
                  </div>

                  <div className="contacts-info-row">
                    <span>Юр. название</span>
                    <strong>{SITE_REQUISITES.fullLegalName}</strong>
                  </div>

                  <div className="contacts-info-row">
                    <span>ИНН</span>
                    <strong>{SITE_REQUISITES.taxId}</strong>
                  </div>

                  <div className="contacts-info-row">
                    <span>ОГРН</span>
                    <strong>{SITE_REQUISITES.registrationNumber}</strong>
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
                      className="contacts-map-placeholder__icon"
                      aria-hidden="true"
                    >
                      <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z" />
                      <circle cx="12" cy="10" r="3" />
                    </svg>
                    <div className="contacts-map-placeholder__address">
                      {SITE_ADDRESS_DISPLAY}
                    </div>
                    <div className="contacts-map-placeholder__hours">
                      Режим работы: {SITE_WORKING_HOURS_DISPLAY}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="contacts-layout__side">
              <HeroLeadForm
                title="Напишите нам"
                subtitle="Оставьте телефон и вопрос — ответим в рабочее время."
                submitLabel="Отправить"
                source="Страница контактов"
              />
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}
