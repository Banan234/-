// @vitest-environment jsdom
// Файл проверяет страницу контактов, лид-форму, ссылки и SEO-разметку.

import '../test/renderTestSetup.js';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import {
  SITE_ADDRESS_DISPLAY,
  SITE_EMAIL,
  SITE_EMAIL_HREF,
  SITE_PHONE_DISPLAY,
  SITE_PHONE_HREF,
  SITE_REQUISITES,
} from '../lib/siteConfig.js';
import ContactsPage from './ContactsPage.jsx';

function renderContactsPage() {
  render(
    <MemoryRouter
      initialEntries={['/contacts']}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <ContactsPage />
    </MemoryRouter>
  );
}

describe('ContactsPage', () => {
  it('берет NAP и реквизиты из siteConfig', () => {
    renderContactsPage();

    expect(screen.getAllByText(SITE_ADDRESS_DISPLAY)).toHaveLength(2);
    expect(screen.getAllByText(SITE_EMAIL)).toHaveLength(4);
    expect(
      document.querySelectorAll(`a[href="${SITE_PHONE_HREF}"]`)
    ).toHaveLength(2);
    expect(
      Array.from(document.querySelectorAll(`a[href="${SITE_PHONE_HREF}"]`)).map(
        (link) => link.textContent
      )
    ).toEqual([SITE_PHONE_DISPLAY, SITE_PHONE_DISPLAY]);
    expect(
      document.querySelectorAll(`a[href="${SITE_EMAIL_HREF}"]`)
    ).toHaveLength(4);
    expect(screen.getByText(SITE_REQUISITES.fullLegalName)).toBeInTheDocument();
    expect(screen.getByText(SITE_REQUISITES.taxId)).toBeInTheDocument();
    expect(
      screen.getByText(SITE_REQUISITES.registrationNumber)
    ).toBeInTheDocument();
  });
});
