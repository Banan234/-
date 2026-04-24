import { useEffect, useState } from 'react';
import Container from '../components/ui/Container';
import HeroLeadForm from '../components/home/HeroLeadForm';
import CategoryShowcase from '../components/home/CategoryShowcase';
import StockProductsGrid from '../components/home/StockProductsGrid';
import { fetchFeaturedProducts } from '../lib/productsApi';
import { useSEO } from '../hooks/useSEO';

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
    title: 'Оставляете заявку',
    text: 'Отправляете задачу или список кабеля.',
  },
  {
    number: '02',
    title: 'Связываемся с вами',
    text: 'Уточняем детали за 5–10 минут.',
  },
  {
    number: '03',
    title: 'Подбираем кабель',
    text: 'Проверяем наличие и подбираем вариант.',
  },
  {
    number: '04',
    title: 'Отправляем КП',
    text: 'Отправляем цены и сроки за 15–30 минут.',
  },
  {
    number: '05',
    title: 'Отгружаем со склада',
    text: 'Комплектуем и отгружаем заказ.',
    featured: true,
  },
];

export default function HomePage() {
  useSEO({
    title: 'Надёжные поставки кабеля оптом для строительства и промышленности',
    description:
      'Работаем с юрлицами. Подберём кабель под ваш объект и подготовим коммерческое предложение в течение 30 минут.',
  });

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
    window.dispatchEvent(new CustomEvent('open-quote-modal'));
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
          <HeroLeadForm />
        </div>
      </div>

      <CategoryShowcase />

      <StockProductsGrid
        products={products}
        isLoading={isLoading}
        loadError={loadError}
      />

      <section className="section section--soft home-workflow">
        <Container>
          <div className="home-workflow__intro">
            <div>
              <div className="home-workflow__eyebrow">Как мы работаем?</div>
              <h2 className="section-title section-title--left">От заявки до отгрузки за 1 день</h2>
            </div>
            <p className="home-workflow__lead">
              5 понятных шагов без лишних звонков и долгих согласований: сразу даём решение под вашу задачу.
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
              Получить КП за 15 минут
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
    </>
  );
}
