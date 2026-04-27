// @vitest-environment jsdom

import '../../test/renderTestSetup.js';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import HeroLeadForm from './HeroLeadForm.jsx';

describe('HeroLeadForm render flow', () => {
  it('связывает ошибки телефона и согласия с полями формы', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    render(<HeroLeadForm />);

    await user.click(screen.getByRole('button', { name: 'Получить КП' }));

    const phoneInput = screen.getByLabelText('Ваш телефон');
    const consentInput = screen.getByLabelText(
      'Даю согласие на обработку персональных данных'
    );
    const phoneError = screen.getByText('Укажите корректный телефон');
    const consentError = screen.getByText('Нужно согласие на обработку данных');

    expect(fetchMock).not.toHaveBeenCalled();
    expect(phoneInput).toHaveAttribute('aria-invalid', 'true');
    expect(phoneInput).toHaveAttribute('aria-describedby', phoneError.id);
    expect(phoneInput).toHaveAccessibleDescription(phoneError.textContent);
    expect(consentInput).toHaveAttribute('aria-invalid', 'true');
    expect(consentInput).toHaveAttribute('aria-describedby', consentError.id);
    expect(consentInput).toHaveAccessibleDescription(consentError.textContent);
  });
});
