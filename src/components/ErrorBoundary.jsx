import { Component } from 'react';
import { captureException } from '../lib/errorTracking';
import { messages } from '../../shared/messages.js';

// React ErrorBoundary, который ловит throw на этапе render/lifecycle
// и сообщает в Sentry/GlitchTip через captureException. Без VITE_SENTRY_DSN
// captureException становится console.error — поведение не меняется.
//
// Назначение — приземлить «белый экран». В fallback показываем простой UI
// с кнопкой «Перезагрузить страницу», чтобы пользователь не застрял.

export class ErrorBoundary extends Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    captureException(error, {
      componentStack: errorInfo?.componentStack,
      boundary: this.props.name || 'root',
    });
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div
          role="alert"
          style={{
            padding: '48px 24px',
            maxWidth: 560,
            margin: '64px auto',
            textAlign: 'center',
            color: 'var(--text)',
          }}
        >
          <h1 style={{ marginBottom: 16, fontSize: 24 }}>
            {messages.errors.errorBoundary.title}
          </h1>
          <p style={{ marginBottom: 24, color: 'var(--muted)' }}>
            {messages.errors.errorBoundary.description}
          </p>
          <button
            type="button"
            className="button-primary"
            onClick={this.handleReload}
          >
            {messages.text.errorBoundaryReload}
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
