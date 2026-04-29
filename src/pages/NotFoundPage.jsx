import { Link } from 'react-router-dom';
import Container from '../components/ui/Container';
import { useSEO } from '../hooks/useSEO';
import { messages } from '../../shared/messages.js';
import '../styles/pages/content.css';

export default function NotFoundPage() {
  useSEO({
    title: 'Страница не найдена',
    description:
      'Страница не найдена. Перейдите в каталог ЮжУралЭлектроКабель или вернитесь на главную.',
    noindex: true,
  });

  return (
    <section className="section">
      <Container>
        <div className="content-page">
          <h1 className="page-title">Страница не найдена</h1>
          <p className="page-subtitle">
            Адрес устарел или был набран с ошибкой.
          </p>
          <div className="content-actions">
            <Link to="/catalog" className="button-primary">
              {messages.text.backToCatalog}
            </Link>
            <Link to="/" className="button-secondary">
              На главную
            </Link>
          </div>
        </div>
      </Container>
    </section>
  );
}
