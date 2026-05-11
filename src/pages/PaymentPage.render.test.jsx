// @vitest-environment jsdom
// Файл проверяет ключевой контент страницы оплаты, единый сценарий сделки, документы и CTA.

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

  it('показывает единый сценарий сделки, отдельные блоки для клиентов и реквизиты', () => {
    renderPaymentPage();

    expect(
      screen.getByRole('heading', { name: 'Оплата и оформление поставки' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        name: 'Условия оплаты для компаний и физических лиц',
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Для юридических лиц и ИП' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Для физических лиц' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Что фиксируем до оплаты' })
    ).toBeInTheDocument();
    expect(screen.getByText(SITE_REQUISITES.fullLegalName)).toBeInTheDocument();
    expect(
      screen.getByText(
        'Сайт носит информационный характер. Окончательные условия поставки, стоимость, сроки отгрузки, способ доставки и комплект документов согласуются менеджером после получения заявки.'
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Продажа физическим лицам осуществляется после подтверждения наличия, цены, способа получения и иных условий поставки. Сайт не оформляет покупку автоматически: менеджер сначала согласует условия, затем направляет счёт или договор.'
      )
    ).toBeInTheDocument();
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
