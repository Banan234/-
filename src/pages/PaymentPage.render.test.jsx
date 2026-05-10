// @vitest-environment jsdom
// Файл проверяет ключевой контент страницы оплаты, документы и CTA на запрос счёта.

import '../test/renderTestSetup.js';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SITE_EMAIL_HREF,
  SITE_PHONE_HREF,
  SITE_REQUISITES,
} from '../lib/siteConfig.js';
import PaymentPage from './PaymentPage.jsx';

function renderPaymentPage() {
  render(
    <MemoryRouter
      initialEntries={['/payment']}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <PaymentPage />
    </MemoryRouter>
  );
}

describe('PaymentPage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('показывает ключевые сценарии оплаты и реквизиты', () => {
    renderPaymentPage();

    expect(
      screen.getByRole('heading', { name: 'Как можно оплатить' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Для юридических лиц' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Для ИП и физических лиц' })
    ).toBeInTheDocument();
    expect(screen.getByText(SITE_REQUISITES.fullLegalName)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Скачать реквизиты' })
    ).toHaveAttribute('href', '/documents/company-details.pdf');
    expect(
      screen.getByRole('link', {
        name: 'Остались вопросы? Связаться с менеджером',
      })
    ).toHaveAttribute('href', SITE_PHONE_HREF);
    expect(
      document.querySelector(`a[href="${SITE_PHONE_HREF}"]`)
    ).not.toBeNull();
    expect(
      document.querySelector(`a[href="${SITE_EMAIL_HREF}"]`)
    ).not.toBeNull();
  });

  it('открывает лид-форму по кнопке запроса счёта', () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

    renderPaymentPage();
    fireEvent.click(
      screen.getAllByRole('button', { name: 'Запросить счёт' })[0]
    );

    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    expect(dispatchSpy.mock.calls[0][0]).toBeInstanceOf(CustomEvent);
    expect(dispatchSpy.mock.calls[0][0].type).toBe('open-lead-modal');
    expect(dispatchSpy.mock.calls[0][0].detail).toEqual(
      expect.objectContaining({
        title: 'Запросить счёт и условия оплаты',
        submitLabel: 'Запросить счёт',
        source: 'CTA на странице оплаты',
      })
    );
  });
});
