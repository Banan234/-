// @vitest-environment jsdom

import '../../test/renderTestSetup.js';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import QuoteForm from './QuoteForm.jsx';

const quoteItem = {
  id: 101,
  sku: 'VVG-001',
  title: 'ВВГнг-LS 3x2.5',
  category: 'Силовой кабель',
  price: 120,
  quantity: 2,
  unit: 'м',
};

async function fillRequiredFields(user) {
  await user.type(screen.getByLabelText(/Имя/), 'Иван Петров');
  await user.type(screen.getByLabelText(/Телефон/), '+7 900 123-45-67');
}

describe('QuoteForm render flow', () => {
  it('блокирует отправку при пустой корзине и не вызывает API', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    render(<QuoteForm itemsOverride={[]} />);

    await fillRequiredFields(user);
    await user.click(
      screen.getByRole('button', { name: /Отправить запрос КП/ })
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText(/^Корзина пуста$/)).toBeInTheDocument();
  });

  it('показывает success-сообщение после успешной отправки', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, message: 'Заявка принята' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<QuoteForm itemsOverride={[quoteItem]} />);

    await fillRequiredFields(user);
    await user.click(
      screen.getByRole('button', { name: /Отправить запрос КП/ })
    );

    expect(await screen.findByText('Заявка принята')).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const [, request] = fetchMock.mock.calls[0];
    const payload = JSON.parse(request.body);
    expect(request.method).toBe('POST');
    expect(payload.customer).toMatchObject({
      name: 'Иван Петров',
      phone: '+7 900 123-45-67',
      preferredChannel: 'phone',
    });
    expect(payload.items).toHaveLength(1);
    expect(payload.totalCount).toBe(1);
    expect(payload.totalPrice).toBe(240);
  });

  it('требует email, если выбран канал связи Email', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    render(<QuoteForm itemsOverride={[quoteItem]} />);

    await fillRequiredFields(user);
    await user.click(screen.getByLabelText('Email'));
    await user.click(
      screen.getByRole('button', { name: /Отправить запрос КП/ })
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText(/Укажите email/)).toBeInTheDocument();

    const emailInput = screen.getByRole('textbox', { name: /Email/ });
    const emailError = screen.getByText(/Укажите email/);
    expect(emailInput).toHaveAttribute('aria-invalid', 'true');
    expect(emailInput).toHaveAttribute('aria-describedby', emailError.id);
    expect(emailInput).toHaveAccessibleDescription(emailError.textContent);
  });

  it('связывает обязательные поля с ошибками через aria-describedby', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    render(<QuoteForm itemsOverride={[quoteItem]} />);

    await user.click(
      screen.getByRole('button', { name: /Отправить запрос КП/ })
    );

    const nameInput = screen.getByLabelText(/Имя/);
    const phoneInput = screen.getByLabelText(/Телефон/);
    const nameError = screen.getByText('Введите имя');
    const phoneError = screen.getByText('Введите телефон');

    expect(fetchMock).not.toHaveBeenCalled();
    expect(nameInput).toHaveAttribute('aria-invalid', 'true');
    expect(nameInput).toHaveAttribute('aria-describedby', nameError.id);
    expect(nameInput).toHaveAccessibleDescription(nameError.textContent);
    expect(phoneInput).toHaveAttribute('aria-invalid', 'true');
    expect(phoneInput).toHaveAttribute('aria-describedby', phoneError.id);
    expect(phoneInput).toHaveAccessibleDescription(phoneError.textContent);
  });
});
