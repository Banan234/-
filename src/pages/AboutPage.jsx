import Container from '../components/ui/Container';
import { useSEO } from '../hooks/useSEO';

export default function AboutPage() {
  useSEO({
    title: 'О компании — ЮжУралЭлектроКабель',
    description:
      'ЮжУралЭлектроКабель — надёжный поставщик кабельно-проводниковой продукции. Работаем с 2008 года, более 5000 позиций в наличии.',
  });

  return (
    <section className="section">
      <Container>
        <h1 className="page-title">О компании</h1>
        <p className="page-subtitle">
          ООО «ЮжУралЭлектроКабель» — электротехническая компания с 16-летним
          опытом работы на рынке кабельно-проводниковой продукции. Мы поставляем
          кабель для строительных и промышленных компаний по всей России.
        </p>
        <div
          className="about-facts"
          style={{
            marginTop: 40,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 24,
          }}
        >
          {[
            { num: '16 лет', label: 'на рынке' },
            { num: '5 000+', label: 'позиций в наличии' },
            { num: 'от 1 дня', label: 'срок отгрузки' },
            { num: 'НДС', label: 'работаем по договору' },
          ].map(({ num, label }) => (
            <div
              key={label}
              style={{
                background: 'var(--bg-soft)',
                borderRadius: 16,
                padding: '28px 24px',
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  fontSize: 36,
                  fontWeight: 800,
                  color: 'var(--primary)',
                }}
              >
                {num}
              </div>
              <div style={{ marginTop: 6, color: 'var(--muted)' }}>{label}</div>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
