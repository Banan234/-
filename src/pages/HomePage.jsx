import { useEffect, useState } from 'react';
import Container from '../components/ui/Container';
import CategoryShowcase from '../components/home/CategoryShowcase';
import HeroLeadForm from '../components/home/HeroLeadForm';
import StockProductsGrid from '../components/home/StockProductsGrid';
import { fetchFeaturedProducts } from '../lib/productsApi';
import { captureException } from '../lib/errorTracking';
import { useSEO } from '../hooks/useSEO';
import { useJsonLd } from '../hooks/useJsonLd';
import { usePrerenderData } from '../lib/prerenderData';
import { messages } from '../../shared/messages.js';
import {
  SITE_ADDRESS_DISPLAY,
  SITE_MANUFACTURERS,
  SITE_NAME,
  SITE_PUBLIC_DOCUMENTS,
  SITE_QUOTE_RESPONSE_DISPLAY,
  SITE_REQUEST_DOCUMENTS,
  SITE_REQUISITES,
  SITE_URL,
  SITE_WORKING_HOURS_DISPLAY,
  buildOrganizationJsonLd,
} from '../lib/siteConfig';
import '../styles/sections/home-critical.css';

const heroBenefits = [
  'Прайс-лист XLS в открытом доступе',
  'Отгрузка от 1 дня',
  'ИНН и ОГРН на сайте',
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
    title: 'КП в рабочий день',
    text: 'Проверяем наличие, подбираем позиции и отправляем коммерческое предложение без обещаний вслепую.',
  },
  {
    number: '03',
    title: 'Отгружаем со склада',
    text: 'Комплектуем заказ и отгружаем со склада.',
    featured: true,
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
  ...buildOrganizationJsonLd(),
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
    title: 'Кабель оптом в Челябинске',
    description: `Работаем с юрлицами. Подберём кабель под ваш объект и подготовим коммерческое предложение ${SITE_QUOTE_RESPONSE_DISPLAY}.`,
  });

  useJsonLd('home-organization-json-ld', ORGANIZATION_JSON_LD);
  useJsonLd('home-website-json-ld', WEBSITE_JSON_LD);

  const prerenderData = usePrerenderData();
  const initialFeaturedProducts = Array.isArray(
    prerenderData.home?.featuredProducts
  )
    ? prerenderData.home.featuredProducts
    : [];
  const hasInitialFeaturedProducts = initialFeaturedProducts.length > 0;

  const [products, setProducts] = useState(initialFeaturedProducts);
  const [isLoading, setIsLoading] = useState(!hasInitialFeaturedProducts);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    void import('../styles/sections/home.css');
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    if (hasInitialFeaturedProducts) {
      return () => controller.abort();
    }

    async function loadProducts() {
      try {
        setIsLoading(true);
        setLoadError('');
        const items = await fetchFeaturedProducts(10, controller.signal);
        setProducts(items);
      } catch (error) {
        if (error.name !== 'AbortError') {
          captureException(error, { source: 'HomePage.loadFeatured' });
          if (!hasInitialFeaturedProducts) {
            setLoadError(messages.errors.home.featuredLoadFailed);
          }
        }
      } finally {
        setIsLoading(false);
      }
    }

    loadProducts();
    return () => controller.abort();
  }, [hasInitialFeaturedProducts]);

  const openQuoteModal = () => {
    window.dispatchEvent(
      new CustomEvent('open-quote-modal', {
        detail: {
          title: 'Получить КП',
          subtitle:
            'Оставьте телефон и комментарий — подготовим предложение по вашей задаче.',
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
          <picture className="home-hero__bg" aria-hidden="true">
            <source
              srcSet="/hero-bg-768.avif 768w, /hero-bg-1024.avif 1024w, /hero-bg-1280.avif 1280w, /hero-bg-1536.avif 1536w"
              sizes="100vw"
              type="image/avif"
            />
            <source
              srcSet="/hero-bg-768.webp 768w, /hero-bg-1024.webp 1024w, /hero-bg-1280.webp 1280w, /hero-bg-1536.webp 1536w"
              sizes="100vw"
              type="image/webp"
            />
            <img
              src="/hero-bg-1280.webp"
              alt=""
              width="1280"
              height="853"
              fetchpriority="high"
              loading="eager"
              decoding="async"
            />
          </picture>
          <Container>
            <div className="home-hero__content">
              <h1 className="home-hero__title">
                Кабель оптом со склада в Челябинске
              </h1>
              <p className="home-hero__subtitle">
                Отгрузка от{' '}
                <span className="home-hero__subtitle-accent">1 дня</span> ·
                Поставки по всей России
                <br />
                КП готовим{' '}
                <span className="home-hero__subtitle-accent">
                  {SITE_QUOTE_RESPONSE_DISPLAY}
                </span>
              </p>
              <div className="home-hero__actions">
                <button
                  type="button"
                  className="home-hero__btn-primary"
                  onClick={openQuoteModal}
                >
                  Запросить КП
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
          <HeroLeadForm
            subtitle={`Ответим ${SITE_QUOTE_RESPONSE_DISPLAY}`}
            source="Форма в герое главной"
            idPrefix="home-lead"
          />
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
              <div className="home-documents__eyebrow">
                Документы для закупки
              </div>
              <h2 className="section-title section-title--left">
                <span id="procurement-documents-title">
                  Скачать прайс и типовой договор
                </span>
              </h2>
              <p className="home-documents__lead">
                Открытые файлы до заявки: прайс-лист, типовой договор и
                реквизиты компании.
              </p>
            </div>

            <ul className="home-documents__links">
              {SITE_PUBLIC_DOCUMENTS.map((doc) => (
                <li key={doc.href}>
                  <a href={doc.href} download className="home-documents__link">
                    <span
                      className="home-documents__filetype"
                      aria-hidden="true"
                    >
                      {doc.type}
                    </span>
                    <span className="home-documents__link-copy">
                      <span className="home-documents__link-title">
                        {doc.title}
                      </span>
                      <span className="home-documents__link-meta">
                        {doc.description}
                      </span>
                    </span>
                    <span
                      className="home-documents__download"
                      aria-hidden="true"
                    >
                      ↓
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </Container>
      </section>

      <section className="section home-proof">
        <Container>
          <div className="home-proof__head">
            <div>
              <div className="home-proof__eyebrow">Проверка до заявки</div>
              <h2 className="section-title section-title--left">
                Реквизиты, адрес и условия работы открыты на сайте
              </h2>
            </div>
            <p className="home-proof__lead">
              Чтобы закупке не приходилось выяснять базовые вещи после звонка:
              юрданные, документы и рабочий порядок можно проверить заранее.
            </p>
          </div>

          <div className="home-proof__grid">
            <article className="home-proof__card">
              <h3 className="home-proof__title">Юридические данные</h3>
              <dl className="home-proof__details">
                <div>
                  <dt>Организация</dt>
                  <dd>{SITE_REQUISITES.fullLegalName}</dd>
                </div>
                <div>
                  <dt>ИНН</dt>
                  <dd>{SITE_REQUISITES.taxId}</dd>
                </div>
                <div>
                  <dt>ОГРН</dt>
                  <dd>{SITE_REQUISITES.registrationNumber}</dd>
                </div>
              </dl>
            </article>

            <article className="home-proof__card">
              <h3 className="home-proof__title">Адрес и режим</h3>
              <dl className="home-proof__details">
                <div>
                  <dt>Адрес</dt>
                  <dd>{SITE_ADDRESS_DISPLAY}</dd>
                </div>
                <div>
                  <dt>Режим</dt>
                  <dd>{SITE_WORKING_HOURS_DISPLAY}</dd>
                </div>
              </dl>
            </article>

            <article className="home-proof__card">
              <h3 className="home-proof__title">Производители в прайсе</h3>
              <p className="home-proof__text">
                Работаем с номенклатурой российских и зарубежных производителей:
                {` ${SITE_MANUFACTURERS.slice(0, 7).join(', ')} `}и другими
                позициями из прайс-листа.
              </p>
            </article>
          </div>
        </Container>
      </section>

      <section className="section home-quality-docs">
        <Container>
          <div className="home-quality-docs__head">
            <div>
              <div className="home-quality-docs__eyebrow">
                Гарантии качества
              </div>
              <h2 className="section-title section-title--left">
                <span id="quality-documents-title">
                  Каждая отгрузка — с пакетом документов
                </span>
              </h2>
            </div>
            <p className="home-quality-docs__lead">
              Закрывающие документы передаём по отгрузке. Сертификаты, паспорта
              качества, протоколы и фото партии предоставляем по запросу для
              согласованной позиции.
            </p>
          </div>

          <ul className="home-quality-docs__grid">
            {qualityDocuments.map((doc) => (
              <li key={doc.title} className="home-quality-docs__item">
                <span className="home-quality-docs__icon" aria-hidden="true">
                  {doc.icon}
                </span>
                <div>
                  <h3 className="home-quality-docs__title">{doc.title}</h3>
                  <p className="home-quality-docs__text">{doc.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      <section className="section section--soft home-request-docs">
        <Container>
          <div className="content-columns">
            <div>
              <div className="home-request-docs__eyebrow">
                Что предоставляем по запросу
              </div>
              <h2 className="section-title section-title--left">
                Не обещаем “всё есть”: подтверждаем документами
              </h2>
              <p className="content-lead">
                Сертификаты и паспорта зависят от конкретной марки, завода и
                партии. Поэтому отправляем их после проверки позиции, а не
                выкладываем универсальные сканы без привязки к поставке.
              </p>
            </div>

            <ul className="info-list">
              {SITE_REQUEST_DOCUMENTS.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </Container>
      </section>

      <section className="section section--soft home-workflow">
        <Container>
          <div className="home-workflow__intro">
            <div>
              <div className="home-workflow__eyebrow">Как мы работаем?</div>
              <h2 className="section-title section-title--left">
                От заявки до отгрузки за 1 день
              </h2>
            </div>
            <p className="home-workflow__lead">
              3 шага: заявка, проверка наличия и цены, затем отгрузка со склада
              после оплаты и согласования комплектации.
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
              Запросить КП
            </button>
          </div>
        </Container>
      </section>

      <section className="section section--dark-soft home-audience">
        <Container>
          <div className="home-audience__head">
            <div className="home-audience__eyebrow">С кем мы работаем?</div>
            <h2 className="section-title section-title--left">
              <span id="audience-segments-title">
                Работаем с теми, кому нужен быстрый и понятный закупочный
                процесс
              </span>
            </h2>
            <p className="home-audience__sub">
              Если у вас горят сроки, нужна ясность по наличию и требуется КП
              без лишней переписки, этот формат работы для вас.
            </p>
          </div>

          <ul className="home-audience__grid">
            {audienceSegments.map((item) => (
              <li key={item.title} className="home-audience__card">
                <h3 className="home-audience__title">{item.title}</h3>
                <p className="home-audience__text">{item.text}</p>
              </li>
            ))}
          </ul>
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
              Коротко о ценах, наличии, оплате, доставке и минимальной партии до
              того, как заявка уйдёт в закупки.
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
