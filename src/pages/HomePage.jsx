import { useEffect, useState } from 'react';
import Container from '../components/ui/Container';
import HeroLeadForm from '../components/home/HeroLeadForm';
import CategoryShowcase from '../components/home/CategoryShowcase';
import StockProductsGrid from '../components/home/StockProductsGrid';
import { fetchFeaturedProducts } from '../lib/productsApi';
import { useSEO } from '../hooks/useSEO';
import { useJsonLd } from '../hooks/useJsonLd';
import {
  SITE_ADDRESS,
  SITE_DESCRIPTION,
  SITE_EMAIL,
  SITE_LEGAL_NAME,
  SITE_LOGO_PATH,
  SITE_NAME,
  SITE_OPENING_HOURS,
  SITE_PHONE,
  SITE_SOCIAL_LINKS,
  SITE_URL,
  absoluteUrl,
} from '../lib/siteConfig';
import '../styles/sections/home.css';
import '../styles/sections/commerce.css';

const heroBenefits = [
  'Более 5 000 позиций в наличии',
  'Отгрузка от 1 дня',
  '16 лет на рынке',
  'Работаем с НДС и по договору',
];

const audienceSegments = [
  {
    title: 'Строительным компаниям',
    text: 'Закрываем кабельные позиции для объектов, чтобы стройка не вставала из-за сроков поставки.',
  },
  {
    title: 'Подрядчикам',
    text: 'Помогаем быстро подобрать кабель под проект и отправить КП без затяжных согласований.',
  },
  {
    title: 'Снабженцам',
    text: 'Даём понятный расчёт по наличию, срокам и стоимости, чтобы быстрее закрывать заявки внутри компании.',
  },
  {
    title: 'Промышленным предприятиям',
    text: 'Подбираем кабель для производственных задач и регулярных закупок с отгрузкой со склада.',
  },
];
const workflowSteps = [
  {
    number: '01',
    title: 'Заявка',
    text: 'Отправляете задачу или список кабеля.',
  },
  {
    number: '02',
    title: 'КП за 30 мин',
    text: 'Проверяем наличие, подбираем позиции и отправляем коммерческое предложение.',
  },
  {
    number: '03',
    title: 'Отгружаем со склада',
    text: 'Комплектуем заказ и отгружаем со склада.',
    featured: true,
  },
];

const procurementDocuments = [
  {
    title: 'Скачать прайс-лист',
    meta: 'Excel, обновлён сегодня',
    href: '/price.xls',
    type: 'XLS',
  },
  {
    title: 'Типовой договор поставки',
    meta: 'PDF',
    href: '/documents/supply-contract.pdf',
    type: 'PDF',
  },
  {
    title: 'Реквизиты',
    meta: 'PDF',
    href: '/documents/company-details.pdf',
    type: 'PDF',
  },
];

const qualityDocuments = [
  {
    title: 'УПД / ТОРГ-12',
    text: 'Передаём закрывающие документы для бухгалтерии и закупочного отдела.',
    icon: 'УПД',
  },
  {
    title: 'Сертификаты соответствия',
    text: 'По запросу пришлём сертификаты соответствия по нужной марке кабеля.',
    icon: 'СТ',
  },
  {
    title: 'Сертификат ПБ',
    text: 'Подготовим документы пожарной безопасности для кабеля с такими требованиями.',
    icon: 'ПБ',
  },
  {
    title: 'Протоколы испытаний',
    text: 'Предоставим протоколы испытаний и паспорта качества производителя.',
    icon: 'ИП',
  },
];

const objectionsFaq = [
  {
    question: 'Что, если нужной позиции не будет в прайсе или на складе?',
    answer:
      'Проверим аналоги по марке, сечению и назначению, предложим замену или срок поставки под заказ.',
  },
  {
    question: 'Цена в прайсе — окончательная?',
    answer:
      'Прайс показывает ориентир. Итоговую цену фиксируем в КП или счёте после проверки остатка, объёма и условий доставки.',
  },
  {
    question: 'Есть ли отсрочка?',
    answer:
      'Для постоянных клиентов и поставок по договору обсуждаем отсрочку индивидуально после согласования лимита.',
  },
  {
    question: 'Как быстро отгружаете?',
    answer:
      'Позиции из наличия обычно отгружаем от 1 дня. Срочные заявки выделяем отдельно и сразу называем реальный срок.',
  },
  {
    question: 'Работаете ли с НДС и без?',
    answer:
      'Основной формат для юрлиц — с НДС и закрывающими документами. Другие варианты оплаты уточняем при подготовке КП.',
  },
  {
    question: 'Доставка по России — чем?',
    answer:
      'Отправляем транспортными компаниями, отдельной машиной или через самовывоз со склада в Челябинске.',
  },
  {
    question: 'Минимальная партия?',
    answer:
      'Зависит от марки, сечения и текущего остатка. По складским позициям часто можем отгрузить от одной бухты или нужного метража.',
  },
];

const ORGANIZATION_JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: SITE_NAME,
  legalName: SITE_LEGAL_NAME,
  url: SITE_URL,
  logo: absoluteUrl(SITE_LOGO_PATH),
  description: SITE_DESCRIPTION,
  email: SITE_EMAIL,
  telephone: SITE_PHONE,
  address: {
    '@type': 'PostalAddress',
    streetAddress: SITE_ADDRESS.streetAddress,
    addressLocality: SITE_ADDRESS.addressLocality,
    addressRegion: SITE_ADDRESS.addressRegion,
    postalCode: SITE_ADDRESS.postalCode,
    addressCountry: SITE_ADDRESS.addressCountry,
  },
  openingHoursSpecification: SITE_OPENING_HOURS.map((spec) => ({
    '@type': 'OpeningHoursSpecification',
    // Записан как «Mo-Fr 09:00-18:00» — компактно и совместимо с Google.
    dayOfWeek: spec.split(' ')[0],
    opens: spec.split(' ')[1]?.split('-')[0],
    closes: spec.split(' ')[1]?.split('-')[1],
  })),
  contactPoint: [
    {
      '@type': 'ContactPoint',
      telephone: SITE_PHONE,
      contactType: 'sales',
      areaServed: 'RU',
      availableLanguage: ['ru'],
    },
  ],
  ...(SITE_SOCIAL_LINKS.length > 0 ? { sameAs: SITE_SOCIAL_LINKS } : {}),
};

const WEBSITE_JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: SITE_NAME,
  url: SITE_URL,
  potentialAction: {
    '@type': 'SearchAction',
    target: `${SITE_URL}/catalog?search={search_term_string}`,
    'query-input': 'required name=search_term_string',
  },
};

export default function HomePage() {
  useSEO({
    title: 'Надёжные поставки кабеля оптом для строительства и промышленности',
    description:
      'Работаем с юрлицами. Подберём кабель под ваш объект и подготовим коммерческое предложение в течение 30 минут.',
  });

  useJsonLd('home-organization-json-ld', ORGANIZATION_JSON_LD);
  useJsonLd('home-website-json-ld', WEBSITE_JSON_LD);

  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    const controller = new AbortController();

    async function loadProducts() {
      try {
        setIsLoading(true);
        setLoadError('');
        const items = await fetchFeaturedProducts(10, controller.signal);
        setProducts(items);
      } catch (error) {
        if (error.name !== 'AbortError') {
          console.error('Ошибка загрузки товаров на главной:', error);
          setLoadError('Не удалось загрузить позиции из каталога.');
        }
      } finally {
        setIsLoading(false);
      }
    }

    loadProducts();
    return () => controller.abort();
  }, []);

  const openQuoteModal = () => {
    window.dispatchEvent(
      new CustomEvent('open-quote-modal', {
        detail: {
          title: 'Получить КП',
          subtitle: 'Оставьте телефон и комментарий — подготовим предложение по вашей задаче.',
          submitLabel: 'Получить КП',
          source: 'CTA на главной',
        },
      })
    );
  };

  return (
    <>
      <div className="home-hero-zone">
        <section className="home-hero">
          <div className="home-hero__bg" aria-hidden="true" />
          <Container>
            <div className="home-hero__content">
              <h1 className="home-hero__title">
                Кабель оптом со склада в Челябинске
              </h1>
              <p className="home-hero__subtitle">
                Отгрузка от <span className="home-hero__subtitle-accent">1 дня</span> · Поставки по всей России
                <br />
                Рассчитаем КП за <span className="home-hero__subtitle-accent">15–30 минут</span>
              </p>
              <div className="home-hero__actions">
                <button
                  type="button"
                  className="home-hero__btn-primary"
                  onClick={openQuoteModal}
                >
                  Получить КП за 15 минут
                </button>
              </div>
            </div>
          </Container>
        </section>

        <section className="home-benefits">
          <Container>
            <ul className="home-benefits__list">
              {heroBenefits.map((b) => (
                <li key={b} className="home-benefits__item">
                  <span className="home-benefits__check" aria-hidden="true">
                    <svg width="11" height="9" viewBox="0 0 11 9" fill="none">
                      <path
                        d="M1 4.5L4 7.5L10 1.5"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                  {b}
                </li>
              ))}
            </ul>
          </Container>
        </section>

        <div className="home-hero-zone__form">
          <HeroLeadForm source="Форма в герое главной" />
        </div>
      </div>

      <CategoryShowcase />

      <StockProductsGrid
        products={products}
        isLoading={isLoading}
        loadError={loadError}
      />

      <section className="section home-documents">
        <Container>
          <div className="home-documents__layout">
            <div className="home-documents__copy">
              <div className="home-documents__eyebrow">Документы для закупки</div>
              <h2 className="section-title section-title--left">
                Скачать прайс и типовой договор
              </h2>
              <p className="home-documents__lead">
                Скачать прайс-лист (Excel, обновлён сегодня) · Типовой договор поставки (PDF) · Реквизиты (PDF)
              </p>
            </div>

            <div className="home-documents__links" aria-label="Документы для скачивания">
              {procurementDocuments.map((doc) => (
                <a
                  key={doc.href}
                  href={doc.href}
                  download
                  className="home-documents__link"
                >
                  <span className="home-documents__filetype" aria-hidden="true">
                    {doc.type}
                  </span>
                  <span className="home-documents__link-copy">
                    <span className="home-documents__link-title">{doc.title}</span>
                    <span className="home-documents__link-meta">{doc.meta}</span>
                  </span>
                  <span className="home-documents__download" aria-hidden="true">
                    ↓
                  </span>
                </a>
              ))}
            </div>
          </div>
        </Container>
      </section>

      <section className="section home-quality-docs">
        <Container>
          <div className="home-quality-docs__head">
            <div>
              <div className="home-quality-docs__eyebrow">Гарантии качества</div>
              <h2 className="section-title section-title--left">
                Каждая отгрузка — с пакетом документов
              </h2>
            </div>
            <p className="home-quality-docs__lead">
              УПД/ТОРГ-12, сертификаты соответствия, сертификат ПБ и протоколы испытаний по запросу для любой марки из поставки.
            </p>
          </div>

          <div className="home-quality-docs__grid" aria-label="Документы качества">
            {qualityDocuments.map((doc) => (
              <article key={doc.title} className="home-quality-docs__item">
                <span className="home-quality-docs__icon" aria-hidden="true">
                  {doc.icon}
                </span>
                <div>
                  <h3 className="home-quality-docs__title">{doc.title}</h3>
                  <p className="home-quality-docs__text">{doc.text}</p>
                </div>
              </article>
            ))}
          </div>
        </Container>
      </section>

      <section className="section section--soft home-workflow">
        <Container>
          <div className="home-workflow__intro">
            <div>
              <div className="home-workflow__eyebrow">Как мы работаем?</div>
              <h2 className="section-title section-title--left">От заявки до отгрузки за 1 день</h2>
            </div>
            <p className="home-workflow__lead">
              3 шага без лишних звонков и долгих согласований: заявка, КП за 30 минут и отгрузка со склада.
            </p>
          </div>

          <div className="home-workflow__grid">
            {workflowSteps.map((step) => (
              <article
                key={step.number}
                className={`home-workflow__card${step.featured ? ' home-workflow__card--featured' : ''}`}
              >
                <div className="home-workflow__step">{step.number}</div>
                <h3 className="home-workflow__title">{step.title}</h3>
                <p className="home-workflow__text">{step.text}</p>
              </article>
            ))}
          </div>

          <div className="home-workflow__summary">
            <div className="home-workflow__summary-copy">
              <div className="home-workflow__summary-label">Результат</div>
              <p className="home-workflow__summary-text">
                Вы получаете готовое коммерческое предложение и нужный кабель
                без лишних согласований.
              </p>
            </div>
            <button
              type="button"
              className="home-workflow__cta"
              onClick={openQuoteModal}
            >
              Получить КП за 30 минут
            </button>
          </div>
        </Container>
      </section>

      <section className="section section--dark-soft home-audience">
        <Container>
          <div className="home-audience__head">
            <div className="home-audience__eyebrow">С кем мы работаем?</div>
            <h2 className="section-title section-title--left">Работаем с теми, кому нужен быстрый и понятный закупочный процесс</h2>
            <p className="home-audience__sub">
              Если у вас горят сроки, нужна ясность по наличию и требуется КП без лишней переписки, этот формат работы для вас.
            </p>
          </div>

          <div className="home-audience__grid" aria-label="Кому подходит работа с нами">
            {audienceSegments.map((item) => (
              <article key={item.title} className="home-audience__card">
                <h3 className="home-audience__title">{item.title}</h3>
                <p className="home-audience__text">{item.text}</p>
              </article>
            ))}
          </div>
        </Container>
      </section>

      <section className="section home-objections">
        <Container>
          <div className="home-objections__head">
            <div>
              <div className="home-objections__eyebrow">Вопросы снабжения</div>
              <h2 className="section-title section-title--left">
                Ответы на частые возражения
              </h2>
            </div>
            <p className="home-objections__lead">
              Коротко о ценах, наличии, оплате, доставке и минимальной партии до того, как заявка уйдёт в закупки.
            </p>
          </div>

          <div className="home-objections__list">
            {objectionsFaq.map((item) => (
              <details key={item.question} className="home-objections__item">
                <summary className="home-objections__question">
                  {item.question}
                </summary>
                <p className="home-objections__answer">{item.answer}</p>
              </details>
            ))}
          </div>
        </Container>
      </section>
    </>
  );
}
