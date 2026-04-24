import Container from '../components/ui/Container';
import { useSEO } from '../hooks/useSEO';

export default function PaymentPage() {
  useSEO({
    title: 'Оплата',
    description:
      'Условия оплаты в ЮжУралЭлектроКабель: безналичный расчёт, наличные, счёт для юридических лиц и ИП. НДС, первичные документы.',
  });

  return (
    <section className="section">
      <Container>
        <h1 className="page-title">Оплата</h1>
        <p className="page-subtitle">
          Принимаем оплату удобными для вас способами. Работаем как с
          юридическими, так и с физическими лицами.
        </p>

        <div className="info-cards">
          <div className="info-card">
            <h2 className="info-card__title">Безналичный расчёт</h2>
            <p>
              Оплата по счёту для юридических лиц и ИП. Выставляем счёт,
              счёт-фактуру и товарную накладную.
            </p>
          </div>

          <div className="info-card">
            <h2 className="info-card__title">Банковская карта</h2>
            <p>
              Оплата картами VISA, Mastercard и МИР при самовывозе или через
              платёжную ссылку.
            </p>
          </div>

          <div className="info-card">
            <h2 className="info-card__title">Наличные</h2>
            <p>
              Принимаем наличные при самовывозе со склада в Челябинске.
            </p>
          </div>

          <div className="info-card">
            <h2 className="info-card__title">Договор поставки</h2>
            <p>
              Для постоянных клиентов и крупных партий работаем по договору с
              отсрочкой платежа. Условия обсуждаются индивидуально.
            </p>
          </div>
        </div>

        <div className="info-note">
          По вопросам оформления документов обращайтесь к менеджеру:{' '}
          <a href="tel:+78005553552" className="info-note__link">
            8 800 555 35 52
          </a>
        </div>
      </Container>
    </section>
  );
}
