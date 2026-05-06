import Container from '../components/ui/Container';
import { useJsonLd } from '../hooks/useJsonLd';
import { useSEO } from '../hooks/useSEO';
import {
  buildStaticPageJsonLd,
  getStaticPageJsonLdId,
} from '../lib/staticPageJsonLd';
import { STATIC_PAGE_SEO } from '../lib/staticSeo';
import {
  SITE_ADDRESS_DISPLAY,
  SITE_MANUFACTURERS,
  SITE_PUBLIC_DOCUMENTS,
  SITE_REQUEST_DOCUMENTS,
  SITE_REQUISITES,
  SITE_WORKING_HOURS_DISPLAY,
} from '../lib/siteConfig';
import '../styles/pages/content.css';

const ABOUT_JSON_LD_ID = getStaticPageJsonLdId('/about');
const ABOUT_JSON_LD = buildStaticPageJsonLd('/about');

export default function AboutPage() {
  useSEO({
    title: STATIC_PAGE_SEO.about.title,
    description: STATIC_PAGE_SEO.about.description,
  });

  useJsonLd(ABOUT_JSON_LD_ID, ABOUT_JSON_LD);

  return (
    <>
      <section className="section">
        <Container>
          <h1 className="page-title">О компании</h1>
          <p className="page-subtitle">
            ООО «ЮжУралЭлектроКабель» — электротехническая компания для
            B2B-поставок кабельно-проводниковой продукции. Мы поставляем кабель
            для строительных, монтажных и промышленных организаций по
            Челябинску, Уралу и другим регионам России.
          </p>
          <p className="content-lead">
            Основная задача компании — быстро закрывать потребность снабжения в
            кабеле, проводе и сопутствующей электротехнической продукции:
            проверяем наличие, подбираем аналоги по проектной марке, готовим КП
            и комплектуем заказ под отгрузку со склада.
          </p>

          <div className="about-facts">
            {[
              { num: 'ИНН', label: SITE_REQUISITES.taxId },
              { num: 'ОГРН', label: SITE_REQUISITES.registrationNumber },
              { num: 'от 1 дня', label: 'срок отгрузки' },
              { num: 'НДС', label: 'работаем по договору' },
            ].map(({ num, label }) => (
              <div key={label} className="about-facts__item">
                <div className="about-facts__num">{num}</div>
                <div className="about-facts__label">{label}</div>
              </div>
            ))}
          </div>
        </Container>
      </section>

      <section className="section section--soft">
        <Container>
          <div className="section-head">
            <h2 className="section-title section-title--left">
              Чем полезны для закупки
            </h2>
          </div>

          <div className="info-cards">
            <article className="info-card">
              <h3 className="info-card__title">Подбор по проекту</h3>
              <p>
                Работаем с заявками по марке, сечению, количеству жил,
                напряжению и требованиям объекта. Если нужной позиции нет,
                предложим близкий аналог и отдельно согласуем замену.
              </p>
            </article>

            <article className="info-card">
              <h3 className="info-card__title">Поставка под объект</h3>
              <p>
                Комплектуем кабельные позиции партиями, учитываем кратность бухт
                и барабанов, готовим документы для бухгалтерии и отдела
                снабжения.
              </p>
            </article>

            <article className="info-card">
              <h3 className="info-card__title">Работа с юрлицами</h3>
              <p>
                Выставляем счёт, заключаем договор поставки, отгружаем с НДС и
                передаём закрывающие документы. Реквизиты доступны в разделе
                контактов и в PDF-файле.
              </p>
            </article>

            <article className="info-card">
              <h3 className="info-card__title">Региональная логистика</h3>
              <p>
                Отправляем грузы по России транспортными компаниями и согласуем
                условия доставки до терминала, склада или объекта.
              </p>
            </article>
          </div>
        </Container>
      </section>

      <section className="section">
        <Container>
          <div className="content-columns">
            <div>
              <h2 className="section-title section-title--left">
                Юридическая и операционная проверка
              </h2>
              <p className="content-lead">
                До заявки можно проверить реквизиты, адрес, режим работы,
                типовой договор и прайс. Это базовые данные, которые обычно
                нужны закупке, бухгалтерии и службе безопасности.
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
                  <dt>Адрес</dt>
                  <dd>{SITE_ADDRESS_DISPLAY}</dd>
                </div>
                <div>
                  <dt>Режим</dt>
                  <dd>{SITE_WORKING_HOURS_DISPLAY}</dd>
                </div>
              </dl>
            </div>
          </div>
        </Container>
      </section>

      <section className="section section--soft">
        <Container>
          <div className="content-columns">
            <div>
              <h2 className="section-title section-title--left">
                Документы и качество
              </h2>
              <p className="content-lead">
                По запросу подготавливаем сертификаты соответствия, документы
                пожарной безопасности и паспортные данные по конкретной марке.
                Для регулярных поставок фиксируем условия в договоре. В прайсе
                встречаются позиции производителей{' '}
                {SITE_MANUFACTURERS.slice(0, 6).join(', ')} и других брендов.
              </p>
            </div>

            <ul className="info-list">
              <li>Счёт, УПД или товарная накладная для каждой отгрузки.</li>
              <li>
                Договор поставки для постоянных клиентов и крупных партий.
              </li>
              <li>Сертификаты по маркам кабеля и требованиям объекта.</li>
              <li>Прайс-лист и реквизиты в открытом доступе для проверки.</li>
            </ul>
          </div>

          <div className="proof-documents">
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

          <div className="info-note">
            По запросу предоставляем:{' '}
            {SITE_REQUEST_DOCUMENTS.slice(0, 4).join('; ')}.
          </div>
        </Container>
      </section>
    </>
  );
}
