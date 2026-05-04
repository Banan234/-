import { Link } from 'react-router-dom';
import Container from '../ui/Container';

const categoryCards = [
  {
    title: 'Силовой кабель',
    to: '/catalog/silovoy-kabel',
    examples: 'ВВГ · АВВГ · ВБбШв',
    image: '/category-placeholders/power-cable.svg',
  },
  {
    title: 'Контрольный кабель',
    to: '/catalog/kontrolnyy-kabel',
    examples: 'КВВГ · АКВВГ · КВБбШв',
    image: '/category-placeholders/control-cable.svg',
  },
  {
    title: 'Гибкий кабель',
    to: '/catalog/gibkiy-kabel',
    examples: 'КГ · КГН · РПШ',
    image: '/category-placeholders/flexible-cable.svg',
  },
  {
    title: 'Кабели связи',
    to: '/catalog/kabeli-svyazi',
    examples: 'UTP · FTP · КВК',
    image: '/category-placeholders/communication-cable.svg',
  },
];

export default function CategoryShowcase() {
  function handleBridgeClick(event) {
    const target = document.getElementById('stock-now');

    if (target) {
      event.preventDefault();
      target.scrollIntoView({ behavior: 'smooth' });
    }
  }

  return (
    <section className="section home-category-showcase">
      <Container>
        <div className="home-category-showcase__head">
          <h2 className="section-title section-title--left">
            <span id="popular-categories-title">Популярные категории</span>
          </h2>
          <p className="home-category-showcase__sub">
            Выберите нужный тип кабеля под вашу задачу
          </p>
        </div>

        <ul className="home-category-showcase__grid">
          {categoryCards.map((item) => (
            <li key={item.title} className="home-category-showcase__item">
              <Link to={item.to} className="home-category-showcase__card">
                <div className="home-category-showcase__media">
                  <img
                    src={item.image}
                    alt=""
                    className="home-category-showcase__image"
                    width="560"
                    height="320"
                    loading="lazy"
                    decoding="async"
                  />
                </div>

                <div className="home-category-showcase__body">
                  <h3 className="home-category-showcase__title">
                    {item.title}
                  </h3>
                  <p className="home-category-showcase__examples">
                    {item.examples}
                  </p>
                  <span className="home-category-showcase__cta">
                    Перейти
                    <span aria-hidden="true">→</span>
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>

        <a
          href="#stock-now"
          className="home-category-showcase__bridge"
          onClick={handleBridgeClick}
        >
          Или смотрите товары, доступные прямо сейчас
          <span aria-hidden="true">↓</span>
        </a>
      </Container>
    </section>
  );
}
