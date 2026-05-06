// @vitest-environment jsdom
// Файл проверяет форму КП, добавленные позиции, валидацию и пользовательские сценарии отправки.

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
  await user.click(screen.getByLabelText(/Даю согласие/));
}

describe('QuoteForm render flow', () => {
  it('рендерит обязательный checkbox согласия с ожидаемым текстом', () => {
    render(<QuoteForm itemsOverride={[quoteItem]} />);

    expect(
      screen.getByLabelText('Даю согласие на обработку персональных данных')
    ).toBeInTheDocument();
  });

  it('не сохраняет контактные данные в localStorage и удаляет старый черновик', async () => {
    const user = userEvent.setup();
    localStorage.setItem(
      'yuzhural-quote-form',
      JSON.stringify({
        name: 'Старое имя',
        phone: '+7 900 000-00-00',
        email: 'old@example.test',
        comment: 'старый комментарий',
      })
    );

    render(<QuoteForm itemsOverride={[quoteItem]} />);

    expect(screen.getByLabelText(/Имя/)).toHaveValue('');
    expect(screen.getByLabelText(/Телефон/)).toHaveValue('');
    expect(localStorage.getItem('yuzhural-quote-form')).toBeNull();

    await fillRequiredFields(user);
    await user.type(
      screen.getByRole('textbox', { name: /Email/ }),
      'buyer@company.ru'
    );
    await user.type(screen.getByLabelText(/Комментарий/), 'Не сохранять');

    expect(localStorage.getItem('yuzhural-quote-form')).toBeNull();
  });

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

  it('блокирует отправку без согласия и не вызывает API', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    render(<QuoteForm itemsOverride={[quoteItem]} />);

    await user.type(screen.getByLabelText(/Имя/), 'Иван Петров');
    await user.type(screen.getByLabelText(/Телефон/), '+7 900 123-45-67');
    await user.click(
      screen.getByRole('button', { name: /Отправить запрос КП/ })
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(
      screen.getByText('Нужно согласие на обработку данных')
    ).toBeInTheDocument();
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
      consent: true,
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

  it('показывает ошибку, когда сервер возвращает ok:false', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ ok: false, message: 'Сервис временно недоступен' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<QuoteForm itemsOverride={[quoteItem]} />);

    await fillRequiredFields(user);
    await user.click(
      screen.getByRole('button', { name: /Отправить запрос КП/ })
    );

    expect(
      await screen.findByText('Сервис временно недоступен')
    ).toBeInTheDocument();
    // Ошибка ⇒ нет success-сообщения, форма не очистилась
    expect(screen.queryByText(/Заявка/)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Имя/)).toHaveValue('Иван Петров');
    expect(screen.getByLabelText(/Телефон/)).toHaveValue('+7 900 123-45-67');
  });

  it('показывает понятную ошибку при network failure', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockRejectedValue(new Error('Network down'));
    vi.stubGlobal('fetch', fetchMock);

    render(<QuoteForm itemsOverride={[quoteItem]} />);

    await fillRequiredFields(user);
    await user.click(
      screen.getByRole('button', { name: /Отправить запрос КП/ })
    );

    expect(await screen.findByText('Network down')).toBeInTheDocument();
    // Кнопка снова активна — пользователь может повторить
    const submitButton = screen.getByRole('button', {
      name: /Отправить запрос КП/,
    });
    expect(submitButton).not.toBeDisabled();
  });

  it('блокирует кнопку и меняет лейбл во время отправки', async () => {
    const user = userEvent.setup();
    let resolveFetch;
    const pending = new Promise((resolve) => {
      resolveFetch = resolve;
    });
    const fetchMock = vi.fn().mockReturnValue(pending);
    vi.stubGlobal('fetch', fetchMock);

    render(<QuoteForm itemsOverride={[quoteItem]} />);

    await fillRequiredFields(user);
    await user.click(
      screen.getByRole('button', { name: /Отправить запрос КП/ })
    );

    // Во время полёта кнопка дизейблится и меняет текст
    const submittingBtn = await screen.findByRole('button', {
      name: 'Отправка...',
    });
    expect(submittingBtn).toBeDisabled();

    // Резолвим — после успеха кнопка возвращается
    resolveFetch({
      ok: true,
      json: async () => ({ ok: true, message: 'Готово' }),
    });

    expect(await screen.findByText('Готово')).toBeInTheDocument();
  });

  it('успешно отправляет с email-каналом, когда email указан', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, message: 'Принято' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<QuoteForm itemsOverride={[quoteItem]} />);

    await fillRequiredFields(user);
    await user.type(
      screen.getByRole('textbox', { name: /Email/ }),
      'buyer@company.ru'
    );
    await user.click(screen.getByLabelText('Email'));
    await user.click(
      screen.getByRole('button', { name: /Отправить запрос КП/ })
    );

    expect(await screen.findByText('Принято')).toBeInTheDocument();
    const [, request] = fetchMock.mock.calls[0];
    const payload = JSON.parse(request.body);
    expect(payload.customer.preferredChannel).toBe('email');
    expect(payload.customer.email).toBe('buyer@company.ru');
  });

  it('очищает форму и комментарий после успешной отправки', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, message: 'OK' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<QuoteForm itemsOverride={[quoteItem]} />);

    await fillRequiredFields(user);
    await user.type(
      screen.getByLabelText(/Комментарий/),
      'Срочно, до конца недели'
    );
    await user.click(
      screen.getByRole('button', { name: /Отправить запрос КП/ })
    );

    await screen.findByText('OK');

    expect(screen.getByLabelText(/Имя/)).toHaveValue('');
    expect(screen.getByLabelText(/Телефон/)).toHaveValue('');
    expect(screen.getByLabelText(/Комментарий/)).toHaveValue('');
    // Канал по умолчанию — phone
    expect(screen.getByLabelText('Звонок')).toBeChecked();
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
    const consentInput = screen.getByLabelText(/Даю согласие/);
    const nameError = screen.getByText('Введите имя');
    const phoneError = screen.getByText('Введите телефон');
    const consentError = screen.getByText('Нужно согласие на обработку данных');

    expect(fetchMock).not.toHaveBeenCalled();
    expect(nameInput).toHaveAttribute('aria-invalid', 'true');
    expect(nameInput).toHaveAttribute('aria-describedby', nameError.id);
    expect(nameInput).toHaveAccessibleDescription(nameError.textContent);
    expect(phoneInput).toHaveAttribute('aria-invalid', 'true');
    expect(phoneInput).toHaveAttribute('aria-describedby', phoneError.id);
    expect(phoneInput).toHaveAccessibleDescription(phoneError.textContent);
    expect(consentInput).toHaveAttribute('aria-invalid', 'true');
    expect(consentInput).toHaveAttribute('aria-describedby', consentError.id);
    expect(consentInput).toHaveAccessibleDescription(consentError.textContent);
  });
});
