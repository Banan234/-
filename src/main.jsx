import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { router } from './app/router';
import { initAnalytics } from './lib/analytics';
import { initErrorTracking } from './lib/errorTracking';
import { ErrorBoundary } from './components/ErrorBoundary';
import './styles/global.css';

// Сначала Sentry/GlitchTip — чтобы ошибки на этапе bootstrap тоже попадали
// в трекер. initErrorTracking возвращает promise, но не ждём: capture-вызовы
// до готовности SDK буферизуются внутри.
initErrorTracking();
initAnalytics();

ReactDOM.createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <RouterProvider router={router} />
    </ErrorBoundary>
  </StrictMode>
);
