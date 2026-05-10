// Файл рендерит страницу оплаты: способы расчёта, порядок работы, документы и CTA.

import Container from '../components/ui/Container';
import { useJsonLd } from '../hooks/useJsonLd';
import { useSEO } from '../hooks/useSEO';
import {
  SITE_EMAIL,
  SITE_EMAIL_HREF,
  SITE_PHONE,
  SITE_PHONE_DISPLAY,
  SITE_PUBLIC_DOCUMENTS,
  SITE_REQUISITES,
} from '../lib/siteConfig';
import {
  buildStaticPageJsonLd,
  getStaticPageJsonLdId,
} from '../lib/staticPageJsonLd';
import { STATIC_PAGE_SEO } from '../lib/staticSeo';
import '../styles/pages/content.css';

const PAYMENT_JSON_LD_ID = getStaticPageJsonLdId('/payment');
const PAYMENT_JSON_LD = buildStaticPageJsonLd('/payment');

const PAYMENT_BADGES = [
  'Счёт для юрлиц, ИП и частных клиентов',
  'НДС и закрывающие документы',
  'Отгрузка после поступления оплаты',
];

const PAYMENT_MODES = [
  {
    title: 'Для юридических лиц',
    label: 'Основной сценарий',
    description:
      'Выставляем счёт по реквизитам организации, работаем с НДС и при необходимости закрепляем условия в договоре поставки.',
    points: [
      'Счёт, УПД или накладная, счёт-фактура по запросу.',
      'Резерв и срок действия счёта согласуются менеджером до оплаты.',
      'Для объектных поставок оформляем спецификацию и договор.',
    ],
  },
  {
    title: 'Для ИП и физических лиц',
    label: 'Оплата по счёту',
    description:
      'Подготовим счёт с реквизитами для оплаты в банке, мобильном приложении или через QR-код, если он указан в документе.',
    points: [
      'Подходит для разовой закупки без долгого документооборота.',
      'Перед оплатой лучше подтвердить актуальность цены и наличия.',
      'После поступления денег подтверждаем дату отгрузки.',
    ],
  },
];

const PAYMENT_STEPS = [
  {
    title: 'Получаем заявку',
    text: 'Вы присылаете перечень марок кабеля, объём, город доставки и реквизиты для выставления счёта.',
  },
  {
    title: 'Согласуем условия',
    text: 'Менеджер подтверждает наличие, цену, срок отгрузки, способ получения и комплект документов.',
  },
  {
    title: 'Выставляем счёт',
    text: 'Отправляем счёт, реквизиты, типовой договор и дополнительные файлы, если они нужны для проверки.',
  },
  {
    title: 'Подтверждаем оплату и отгрузку',
    text: 'После поступления средств комплектуем заказ и передаём его на самовывоз или в транспортную компанию.',
  },
];

export default function PaymentPage() {
  function handleOpenPaymentLead() {
    window.dispatchEvent(
      new CustomEvent('open-lead-modal', {
        detail: {
          title: 'Запросить счёт и условия оплаты',
          subtitle:
            'Отправьте список позиций и реквизиты, мы подготовим счёт и подскажем по документам.',
          submitLabel: 'Запросить счёт',
          source: 'CTA на странице оплаты',
        },
      })
    );
  }

  useSEO({
    title: STATIC_PAGE_SEO.payment.title,
    description: STATIC_PAGE_SEO.payment.description,
  });

  useJsonLd(PAYMENT_JSON_LD_ID, PAYMENT_JSON_LD);

  return (
    <>
      <section className="section">
        <Container>
          <div className="payment-page__hero">
            <div className="payment-page__intro">
              <h1 className="page-title">Оплата</h1>
              <p className="page-subtitle">
                Выставляем счёт на кабельно-проводниковую продукцию для
                юридических лиц, ИП и частных клиентов.
              </p>

              <div className="payment-page__badges" aria-label="Условия оплаты">
                {PAYMENT_BADGES.map((badge) => (
                  <span key={badge}>{badge}</span>
                ))}
              </div>

              <div className="content-actions payment-page__hero-actions">
                <button
                  type="button"
                  className="button-primary"
                  onClick={handleOpenPaymentLead}
                >
                  Запросить счёт
                </button>
                <a href={`tel:${SITE_PHONE}`} className="button-secondary">
                  Уточнить условия по телефону
                </a>
              </div>
            </div>

            <aside className="payment-summary">
              <span className="payment-summary__eyebrow">
                Перед оплатой пришлём
              </span>
              <h2 className="payment-summary__title">
                Счёт, срок отгрузки и пакет для бухгалтерии
              </h2>
              <p className="payment-summary__text">
                Сначала проверяем позиции и условия поставки, потом отправляем
                документы на согласование. Это снижает риск повторной оплаты,
                пересчёта цены и задержек на отгрузке.
              </p>
              <ul className="payment-summary__list">
                <li>счёт с реквизитами и суммой заказа</li>
                <li>типовой договор и реквизиты компании</li>
                <li>информацию по самовывозу или передаче в ТК</li>
              </ul>
              <div className="payment-summary__contacts">
                <a
                  href={`tel:${SITE_PHONE}`}
                  className="payment-summary__contact"
                >
                  {SITE_PHONE_DISPLAY}
                </a>
                <a
                  href={SITE_EMAIL_HREF}
                  className="payment-summary__contact payment-summary__contact--muted"
                >
                  {SITE_EMAIL}
                </a>
              </div>
            </aside>
          </div>
        </Container>
      </section>

      <section className="section section--soft">
        <Container>
          <div className="section-head">
            <h2 className="section-title section-title--left">
              Как можно оплатить
            </h2>
          </div>

          <div className="payment-modes">
            {PAYMENT_MODES.map((mode) => (
              <article key={mode.title} className="payment-mode">
                <span className="payment-mode__label">{mode.label}</span>
                <h3 className="payment-mode__title">{mode.title}</h3>
                <p className="payment-mode__description">{mode.description}</p>
                <ul className="payment-mode__list">
                  {mode.points.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </Container>
      </section>

      <section className="section">
        <Container>
          <div className="content-columns">
            <div>
              <h2 className="section-title section-title--left">
                Порядок работы
              </h2>
              <p className="content-lead">
                Страница оплаты должна отвечать на главный вопрос закупки: когда
                можно платить и что будет после этого. Поэтому процесс собран в
                четыре понятных шага.
              </p>
            </div>

            <ol className="payment-steps">
              {PAYMENT_STEPS.map((step) => (
                <li key={step.title}>
                  <strong>{step.title}</strong>
                  <span>{step.text}</span>
                </li>
              ))}
            </ol>
          </div>

          <div className="content-columns content-columns--spaced">
            <div>
              <h2 className="section-title section-title--left">
                Документы и реквизиты
              </h2>
              <p className="content-lead">
                Счёт выставляется от {SITE_REQUISITES.fullLegalName}. Основные
                юридические данные, типовой договор и открытые файлы доступны
                заранее, чтобы бухгалтерия могла проверить контрагента до
                оплаты.
              </p>
            </div>

            <div className="proof-panel">
              <dl className="proof-details">
                <div>
                  <dt>Организация</dt>
                  <dd>{SITE_REQUISITES.fullLegalName}</dd>
                </div>
                <div>
                  <dt>ИНН / ОГРН</dt>
                  <dd>
                    {SITE_REQUISITES.taxId} /{' '}
                    {SITE_REQUISITES.registrationNumber}
                  </dd>
                </div>
                <div>
                  <dt>Формат оплаты</dt>
                  <dd>Безналичный расчёт по счёту</dd>
                </div>
                <div>
                  <dt>Отгрузка</dt>
                  <dd>После поступления оплаты</dd>
                </div>
              </dl>

              <div className="proof-documents proof-documents--compact">
                {SITE_PUBLIC_DOCUMENTS.map((doc) => (
                  <a key={doc.href} href={doc.href} className="proof-document">
                    <span className="proof-document__type">{doc.type}</span>
                    <span>
                      <strong>{doc.title}</strong>
                      <small>{doc.description}</small>
                    </span>
                  </a>
                ))}
              </div>
            </div>
          </div>
        </Container>
      </section>

      <section className="section">
        <Container>
          <div className="payment-cta">
            <div>
              <h2 className="payment-cta__title">
                Нужен счёт на кабель или проверка документов
              </h2>
              <p className="payment-cta__text">
                Отправьте список позиций и реквизиты. Подготовим счёт, проверим
                наличие и сразу подскажем по доставке и комплекту документов.
              </p>
              <p className="payment-cta__text">
                <a href={`tel:${SITE_PHONE}`}>Остались вопросы? Связаться с менеджером</a>
              </p>
            </div>
            <div className="content-actions payment-cta__actions">
              <button
                type="button"
                className="button-primary"
                onClick={handleOpenPaymentLead}
              >
                Запросить счёт
              </button>
              <a
                href="/documents/company-details.pdf"
                className="button-secondary"
              >
                Скачать реквизиты
              </a>
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}
