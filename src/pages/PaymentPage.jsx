import Container from '../components/ui/Container';
import { useJsonLd } from '../hooks/useJsonLd';
import { useSEO } from '../hooks/useSEO';
import { SITE_PHONE, SITE_PHONE_DISPLAY } from '../lib/siteConfig';
import {
  buildStaticPageJsonLd,
  getStaticPageJsonLdId,
} from '../lib/staticPageJsonLd';
import { STATIC_PAGE_SEO } from '../lib/staticSeo';
import '../styles/pages/content.css';

const PAYMENT_JSON_LD_ID = getStaticPageJsonLdId('/payment');
const PAYMENT_JSON_LD = buildStaticPageJsonLd('/payment');

export default function PaymentPage() {
  useSEO({
    title: STATIC_PAGE_SEO.payment.title,
    description: STATIC_PAGE_SEO.payment.description,
  });

  useJsonLd(PAYMENT_JSON_LD_ID, PAYMENT_JSON_LD);

  return (
    <section className="section">
      <Container>
        <h1 className="page-title">Оплата</h1>
        <p className="page-subtitle">
          Основной формат работы — безналичная оплата по счёту для юридических
          лиц и ИП. Поставляем кабельно-проводниковую продукцию с НДС, договором
          и закрывающими документами.
        </p>
        <p className="content-lead">
          После согласования номенклатуры менеджер фиксирует наличие, срок
          отгрузки и стоимость доставки, затем отправляет счёт и комплект
          документов. Для крупных партий и регулярных закупок условия оплаты
          можно закрепить в договоре поставки.
        </p>

        <div className="info-cards">
          <article className="info-card">
            <h2 className="info-card__title">Безналичный расчёт</h2>
            <p>
              Оплата по счёту для юридических лиц и ИП. Выставляем счёт,
              счёт-фактуру при необходимости, УПД или товарную накладную.
            </p>
          </article>

          <article className="info-card">
            <h2 className="info-card__title">НДС и первичка</h2>
            <p>
              Работаем с НДС. В закрывающих документах указываем согласованные
              позиции, количество, единицы измерения и реквизиты покупателя.
            </p>
          </article>

          <article className="info-card">
            <h2 className="info-card__title">Договор поставки</h2>
            <p>
              Для объектных поставок, тендерных закупок и постоянных клиентов
              оформляем договор. Типовой шаблон доступен для предварительной
              проверки.
            </p>
          </article>

          <article className="info-card">
            <h2 className="info-card__title">Отсрочка платежа</h2>
            <p>
              Возможна для постоянных покупателей после согласования лимита,
              объёма закупок и условий договора. Решение принимается
              индивидуально.
            </p>
          </article>
        </div>

        <div className="content-columns content-columns--spaced">
          <div>
            <h2 className="section-title section-title--left">
              Порядок оплаты
            </h2>
            <p className="content-lead">
              Стандартный процесс подходит для разовой закупки и регулярного
              снабжения объектов.
            </p>
          </div>

          <ol className="info-list info-list--ordered">
            <li>Вы отправляете заявку, спецификацию или список позиций.</li>
            <li>Мы проверяем наличие, сроки поставки и возможные аналоги.</li>
            <li>После согласования выставляем счёт на оплату.</li>
            <li>Комплектуем заказ и готовим документы к отгрузке.</li>
          </ol>
        </div>

        <div className="info-note">
          По вопросам счетов, договоров и закрывающих документов обращайтесь к
          менеджеру:{' '}
          <a href={`tel:${SITE_PHONE}`} className="info-note__link">
            {SITE_PHONE_DISPLAY}
          </a>
          . Также можно заранее скачать{' '}
          <a href="/documents/supply-contract.pdf" className="info-note__link">
            типовой договор поставки
          </a>{' '}
          и{' '}
          <a href="/documents/company-details.pdf" className="info-note__link">
            реквизиты компании
          </a>
          .
        </div>
      </Container>
    </section>
  );
}
