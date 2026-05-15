// @vitest-environment jsdom
// Файл проверяет базовое состояние виджета и создание живого диалога.

import '../../test/renderTestSetup.js';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import FloatingLeadWidget from './FloatingLeadWidget.jsx';

function createJsonResponse(payload, ok = true) {
  return {
    ok,
    text: async () => JSON.stringify(payload),
  };
}

describe('FloatingLeadWidget', () => {
  it('по умолчанию остаётся закрытым', () => {
    vi.stubGlobal('fetch', vi.fn());
    window.matchMedia = vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });

    render(<FloatingLeadWidget />);

    expect(
      screen.getByRole('button', { name: 'Отправьте нам сообщение' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Отправьте нам сообщение' })
    ).not.toBeInTheDocument();
  });

  it('может автоматически раскрыться на десктопе при включённом autoOpen', async () => {
    vi.stubGlobal('fetch', vi.fn());
    window.matchMedia = vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });

    render(<FloatingLeadWidget autoOpen />);

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'Отправьте нам сообщение' })
      ).toBeInTheDocument();
    });
  });

  it('раскрывает контактный блок и отправляет заявку после телефона и согласия', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (url) => {
      if (url === '/api/chat/conversations') {
        return createJsonResponse({
          ok: true,
          message: 'Диалог начат. Менеджер ответит здесь в рабочее время.',
          conversationId: 'chat-1',
          customerToken: 'customer-token',
          conversation: {
            id: 'chat-1',
            messages: [
              {
                id: 'm1',
                role: 'manager',
                text: 'Здравствуйте.\nУ вас возникли вопросы? Мы с удовольствием ответим!',
                createdAt: '2026-05-15T10:00:00.000Z',
              },
              {
                id: 'm2',
                role: 'customer',
                text: 'Нужен ВВГ 3x2.5',
                createdAt: '2026-05-15T10:00:01.000Z',
              },
            ],
          },
        });
      }

      if (String(url).startsWith('/api/chat/conversations/chat-1?token=')) {
        return createJsonResponse({
          ok: true,
          conversation: {
            id: 'chat-1',
            messages: [
              {
                id: 'm1',
                role: 'manager',
                text: 'Здравствуйте.\nУ вас возникли вопросы? Мы с удовольствием ответим!',
                createdAt: '2026-05-15T10:00:00.000Z',
              },
              {
                id: 'm2',
                role: 'customer',
                text: 'Нужен ВВГ 3x2.5',
                createdAt: '2026-05-15T10:00:01.000Z',
              },
            ],
          },
        });
      }

      return createJsonResponse(
        {
          ok: false,
          message: 'unexpected',
        },
        false
      );
    });

    vi.stubGlobal('fetch', fetchMock);
    window.matchMedia = vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });

    render(<FloatingLeadWidget />);

    await user.click(
      screen.getByRole('button', { name: 'Отправьте нам сообщение' })
    );

    await screen.findByRole('heading', { name: 'Отправьте нам сообщение' });
    await user.type(
      screen.getByLabelText('Введите сообщение'),
      'Нужен ВВГ 3x2.5'
    );
    await user.click(
      screen.getByRole('button', { name: 'Отправить сообщение' })
    );
    await user.type(screen.getByLabelText('Телефон'), '+7 904 306-94-94');
    await user.click(
      screen.getByLabelText('Даю согласие на обработку персональных данных')
    );
    await user.click(
      screen.getByRole('button', { name: 'Отправить сообщение' })
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/chat/conversations',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      );
    });

    expect(
      await screen.findByText(
        'Диалог начат. Менеджер ответит здесь в рабочее время.'
      )
    ).toBeInTheDocument();
    expect(await screen.findByText('Нужен ВВГ 3x2.5')).toBeInTheDocument();
    expect(
      JSON.parse(localStorage.getItem('yuzhural-chat-session'))
    ).toMatchObject({
      conversationId: 'chat-1',
      customerToken: 'customer-token',
    });
  });

  it('после закрытия показывает широкий launcher с текстом сообщения', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn());
    window.matchMedia = vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });

    render(<FloatingLeadWidget autoOpen />);

    await user.click(await screen.findByLabelText('Свернуть виджет'));

    expect(
      screen.getByRole('button', { name: 'Отправьте нам сообщение' })
    ).toBeInTheDocument();
  });
});
