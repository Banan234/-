import Container from '../components/ui/Container';
import { useJsonLd } from '../hooks/useJsonLd';
import { useSEO } from '../hooks/useSEO';
import {
  SITE_ADDRESS_DISPLAY,
  SITE_PHONE,
  SITE_PHONE_DISPLAY,
} from '../lib/siteConfig';
import {
  buildStaticPageJsonLd,
  getStaticPageJsonLdId,
} from '../lib/staticPageJsonLd';
import { STATIC_PAGE_SEO } from '../lib/staticSeo';
import '../styles/pages/content.css';

const DELIVERY_JSON_LD_ID = getStaticPageJsonLdId('/delivery');
const DELIVERY_JSON_LD = buildStaticPageJsonLd('/delivery');

export default function DeliveryPage() {
  useSEO({
    title: STATIC_PAGE_SEO.delivery.title,
    description: STATIC_PAGE_SEO.delivery.description,
  });

  useJsonLd(DELIVERY_JSON_LD_ID, DELIVERY_JSON_LD);

  return (
    <section className="section">
      <Container>
        <h1 className="page-title">Доставка</h1>
        <p className="page-subtitle">
          Доставляем кабельно-проводниковую продукцию по Челябинску и России.
          Отгружаем со склада, передаём заказы в транспортные компании и
          согласуем доставку под требования объекта.
        </p>
        <p className="content-lead">
          Перед отгрузкой менеджер уточняет вес, объём, формат упаковки, адрес
          терминала или объекта и комплект документов. Бухты, барабаны и крупные
          партии подбираем под безопасную перевозку.
        </p>

        <div className="info-cards">
          <article className="info-card">
            <h2 className="info-card__title">Самовывоз</h2>
            <p>
              Со склада в Челябинске по адресу {SITE_ADDRESS_DISPLAY}. После
              подтверждения готовности заказа согласуем время приезда и порядок
              получения документов.
            </p>
          </article>

          <article className="info-card">
            <h2 className="info-card__title">Доставка по Челябинску</h2>
            <p>
              Организуем городскую доставку до склада, монтажной площадки или
              объекта. Стоимость зависит от объёма партии, адреса и требований к
              разгрузке.
            </p>
          </article>

          <article className="info-card">
            <h2 className="info-card__title">Доставка по России</h2>
            <p>
              Отправляем транспортными компаниями: СДЭК, ПЭК, Деловые Линии и
              другими перевозчиками по согласованию. Стоимость рассчитывается по
              тарифам ТК.
            </p>
          </article>

          <article className="info-card">
            <h2 className="info-card__title">Крупногабаритные грузы</h2>
            <p>
              Бухты кабеля, барабаны и крупные партии отправляем автотранспортом
              или через перевозчика, который принимает такой тип груза.
            </p>
          </article>
        </div>

        <div className="content-columns content-columns--spaced">
          <div>
            <h2 className="section-title section-title--left">
              Что уточняем перед отгрузкой
            </h2>
            <p className="content-lead">
              Эти данные помогают точно рассчитать логистику и избежать задержек
              на терминале или объекте.
            </p>
          </div>

          <ul className="info-list">
            <li>Адрес доставки или терминал транспортной компании.</li>
            <li>Нужна ли доставка до объекта или достаточно терминала.</li>
            <li>Требования к упаковке, погрузке и разгрузке.</li>
            <li>Контакт получателя и комплект закрывающих документов.</li>
          </ul>
        </div>

        <div className="info-note">
          Для уточнения стоимости и сроков доставки свяжитесь с нами по телефону{' '}
          <a href={`tel:${SITE_PHONE}`} className="info-note__link">
            {SITE_PHONE_DISPLAY}
          </a>{' '}
          или оставьте заявку с перечнем позиций, городом доставки и желаемой
          датой отгрузки.
        </div>
      </Container>
    </section>
  );
}
