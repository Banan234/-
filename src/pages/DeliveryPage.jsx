import Container from '../components/ui/Container';
import { useSEO } from '../hooks/useSEO';

export default function DeliveryPage() {
  useSEO({
    title: 'Доставка',
    description:
      'Доставка кабельно-проводниковой продукции по всей России. Самовывоз со склада в Челябинске или через транспортные компании.',
  });

  return (
    <section className="section">
      <Container>
        <h1 className="page-title">Доставка</h1>
        <p className="page-subtitle">
          Доставляем кабельно-проводниковую продукцию по всей России. Работаем
          со всеми крупными транспортными компаниями.
        </p>

        <div className="info-cards">
          <div className="info-card">
            <h2 className="info-card__title">Самовывоз</h2>
            <p>
              Со склада в Челябинске по адресу ул. Южная, 9А. Режим работы
              склада: Пн–Пт 09:00–18:00.
            </p>
          </div>

          <div className="info-card">
            <h2 className="info-card__title">Доставка по Челябинску</h2>
            <p>
              Доставка собственным транспортом по городу. Сроки и стоимость
              согласовываются при оформлении заказа.
            </p>
          </div>

          <div className="info-card">
            <h2 className="info-card__title">Доставка по России</h2>
            <p>
              Отправляем транспортными компаниями: СДЭК, ПЭК, Деловые Линии и
              другими. Стоимость рассчитывается по тарифам перевозчика.
            </p>
          </div>

          <div className="info-card">
            <h2 className="info-card__title">Крупногабаритные грузы</h2>
            <p>
              Бухты кабеля и крупные партии отправляем автотранспортом.
              Уточняйте условия у менеджера.
            </p>
          </div>
        </div>

        <div className="info-note">
          Для уточнения стоимости и сроков доставки свяжитесь с нами по
          телефону{' '}
          <a href="tel:+78005553552" className="info-note__link">
            8 800 555 35 52
          </a>{' '}
          или оставьте заявку.
        </div>
      </Container>
    </section>
  );
}
