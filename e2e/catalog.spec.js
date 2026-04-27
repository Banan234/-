import { expect, test } from '@playwright/test';

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test('catalog loads products from API and opens a product page', async ({
  page,
}) => {
  await page.goto('/catalog');

  await expect(
    page.getByRole('heading', { name: /Каталог продукции|Кабель/i })
  ).toBeVisible();
  await expect(page.getByText(/Найдено:/)).toBeVisible();

  const firstProductTitle = page.locator('.product-card__title-link').first();
  await expect(firstProductTitle).toBeVisible();
  const productTitle = (await firstProductTitle.textContent())?.trim();

  await firstProductTitle.click();

  await expect(page).toHaveURL(/\/product\/[^/]+$/);
  await expect(
    page.getByRole('heading', {
      name: productTitle ? new RegExp(escapeRegExp(productTitle)) : /.+/,
    })
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /Получить КП/ })).toBeVisible();
});

test('catalog search updates URL and keeps results visible', async ({
  page,
}) => {
  await page.goto('/catalog');

  const searchInput = page.getByPlaceholder(
    'Поиск по марке или названию: ВВГнг-LS 3×2.5'
  );
  await expect(searchInput).toBeVisible();

  await searchInput.fill('ВВГ');
  await searchInput.press('Enter');

  await expect(page).toHaveURL(/search=%D0%92%D0%92%D0%93|search=ВВГ/);
  await expect(page.getByText(/Найдено:/)).toBeVisible();
});
