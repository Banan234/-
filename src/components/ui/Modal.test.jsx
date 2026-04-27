// @vitest-environment jsdom

import '../../test/renderTestSetup.js';
import { useState } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import Modal from './Modal.jsx';

function ModalFixture() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setIsOpen(true)}>
        Открыть
      </button>
      <button type="button">Внешняя кнопка</button>

      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        ariaLabel="Тестовое окно"
      >
        <label htmlFor="modal-name">Имя</label>
        <input id="modal-name" />
        <button type="button">Подтвердить</button>
      </Modal>

      <button type="button">После модалки</button>
    </>
  );
}

describe('Modal', () => {
  it('удерживает Tab-фокус внутри окна и возвращает фокус после закрытия', async () => {
    const user = userEvent.setup();

    render(<ModalFixture />);

    const opener = screen.getByRole('button', { name: 'Открыть' });
    await user.click(opener);

    const dialog = screen.getByRole('dialog', { name: 'Тестовое окно' });
    const closeButton = within(dialog).getByRole('button', { name: 'Закрыть' });
    const input = within(dialog).getByLabelText('Имя');
    const submitButton = within(dialog).getByRole('button', {
      name: 'Подтвердить',
    });

    await waitFor(() => expect(closeButton).toHaveFocus());

    await user.tab();
    expect(input).toHaveFocus();

    await user.tab();
    expect(submitButton).toHaveFocus();

    await user.tab();
    expect(closeButton).toHaveFocus();

    await user.tab({ shift: true });
    expect(submitButton).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Тестовое окно' })).toBeNull();
    expect(opener).toHaveFocus();
  });
});
