import { Link } from 'react-router-dom';
import Container from '../ui/Container';

const categoryCards = [
  {
    title: 'Силовой кабель',
    to: '/catalog/silovoy-kabel',
    examples: 'ВВГ · АВВГ · ВБбШв',
    image: '/category-placeholders/power-cable.svg',
    imageAlt: 'Силовой кабель',
  },
  {
    title: 'Контрольный кабель',
    to: '/catalog/kontrolnyy-kabel',
    examples: 'КВВГ · АКВВГ · КВБбШв',
    image: '/category-placeholders/control-cable.svg',
    imageAlt: 'Контрольный кабель',
  },
  {
    title: 'Гибкий кабель',
    to: '/catalog/gibkiy-kabel',
    examples: 'КГ · КГН · РПШ',
    image: '/category-placeholders/flexible-cable.svg',
    imageAlt: 'Гибкий кабель',
  },
  {
    title: 'Кабели связи',
    to: '/catalog/kabeli-svyazi',
    examples: 'UTP · FTP · КВК',
    image: '/category-placeholders/communication-cable.svg',
    imageAlt: 'Кабели связи',
  },
];

export default function CategoryShowcase() {
  function handleBridgeClick(event) {
    event.preventDefault();

    const target = document.getElementById('stock-now');

    if (target) {
      const startY = window.scrollY;
      const targetRect = target.getBoundingClientRect();
      const absoluteTargetTop = targetRect.top + window.scrollY;
      const centeredTargetY =
        absoluteTargetTop - (window.innerHeight - targetRect.height) / 2;
      const maxScrollY =
        document.documentElement.scrollHeight - window.innerHeight;
      const targetY = Math.max(0, Math.min(centeredTargetY, maxScrollY));
      const distance = targetY - startY;
      const duration = 1100;
      const startTime = performance.now();

      function easeInOutCubic(progress) {
        return progress < 0.5
          ? 4 * progress * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 3) / 2;
      }

      function animateScroll(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const easedProgress = easeInOutCubic(progress);

        window.scrollTo(0, startY + distance * easedProgress);

        if (progress < 1) {
          window.requestAnimationFrame(animateScroll);
        }
      }

      window.requestAnimationFrame(animateScroll);
    }
  }

  return (
    <section className="section home-category-showcase">
      <Container>
        <div className="home-category-showcase__head">
          <h2 className="section-title section-title--left">Популярные категории</h2>
          <p className="home-category-showcase__sub">Выберите нужный тип кабеля под вашу задачу</p>
        </div>

        <div className="home-category-showcase__grid" aria-label="Популярные категории каталога">
          {categoryCards.map((item) => (
            <Link key={item.title} to={item.to} className="home-category-showcase__card">
              <div className="home-category-showcase__media">
                <img
                  src={item.image}
                  alt={item.imageAlt}
                  className="home-category-showcase__image"
                />
              </div>

              <div className="home-category-showcase__body">
                <h3 className="home-category-showcase__title">{item.title}</h3>
                <p className="home-category-showcase__examples">{item.examples}</p>
                <span className="home-category-showcase__cta">
                  Перейти
                  <span aria-hidden="true">→</span>
                </span>
              </div>
            </Link>
          ))}
        </div>

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
