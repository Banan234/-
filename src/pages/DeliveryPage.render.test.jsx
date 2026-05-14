// @vitest-environment jsdom
// Файл проверяет ключевой контент страницы доставки: самовывоз, ТК и ссылку на склад.

import '../test/renderTestSetup.js';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SITE_WAREHOUSE_ADDRESS_DISPLAY,
  SITE_WAREHOUSE_MAP_EMBED_URL,
  SITE_WAREHOUSE_MAP_URL,
} from '../lib/siteConfig.js';
import DeliveryPage from './DeliveryPage.jsx';

function renderDeliveryPage() {
  render(
    <MemoryRouter
      initialEntries={['/delivery']}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <DeliveryPage />
    </MemoryRouter>
  );
}

describe('DeliveryPage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('показывает самовывоз и доставку транспортной компанией', () => {
    renderDeliveryPage();

    expect(
      screen.getByRole('heading', { name: 'Самовывоз со склада' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        name: 'Отправка транспортной компанией',
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', {
        name: 'Посмотреть адрес и входы на склад',
      })
    ).toHaveAttribute('href', SITE_WAREHOUSE_MAP_URL);
    expect(
      screen.getByRole('link', { name: SITE_WAREHOUSE_ADDRESS_DISPLAY })
    ).toHaveAttribute('href', SITE_WAREHOUSE_MAP_URL);
    expect(
      screen.getByRole('link', { name: 'Открыть в Яндекс Картах' })
    ).toHaveAttribute('href', SITE_WAREHOUSE_MAP_URL);
    expect(
      screen.getByTitle('Схема проезда к складу самовывоза')
    ).toHaveAttribute('src', SITE_WAREHOUSE_MAP_EMBED_URL);
    expect(
      screen.getByText(
        /Услуги перевозчика оплачивает покупатель по тарифам выбранной ТК/
      )
    ).toBeInTheDocument();
  });

  it('открывает форму вопроса менеджеру по кнопке', () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

    renderDeliveryPage();
    fireEvent.click(
      screen.getByRole('button', { name: 'Связаться с менеджером' })
    );

    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    expect(dispatchSpy.mock.calls[0][0]).toBeInstanceOf(CustomEvent);
    expect(dispatchSpy.mock.calls[0][0].type).toBe('open-lead-modal');
    expect(dispatchSpy.mock.calls[0][0].detail).toEqual(
      expect.objectContaining({
        title: 'Задать вопрос менеджеру',
        submitLabel: 'Задать вопрос',
        source: 'CTA на странице доставки',
      })
    );
  });
});
