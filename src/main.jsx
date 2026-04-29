import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { router } from './app/router';
import { initAnalytics } from './lib/analytics';
import { initErrorTracking } from './lib/errorTracking';
import { ErrorBoundary } from './components/ErrorBoundary';
import {
  getBrowserPrerenderData,
  PrerenderDataProvider,
} from './lib/prerenderData';
import './styles/global.css';

// Сначала Sentry/GlitchTip — чтобы ошибки на этапе bootstrap тоже попадали
// в трекер. initErrorTracking возвращает promise, но не ждём: capture-вызовы
// до готовности SDK буферизуются внутри.
initErrorTracking();
initAnalytics();

const root = document.getElementById('root');
const app = (
  <StrictMode>
    <ErrorBoundary>
      <PrerenderDataProvider data={getBrowserPrerenderData()}>
        <RouterProvider router={router} future={{ v7_startTransition: true }} />
      </PrerenderDataProvider>
    </ErrorBoundary>
  </StrictMode>
);

if (root.hasChildNodes()) {
  ReactDOM.hydrateRoot(root, app);
} else {
  ReactDOM.createRoot(root).render(app);
}
