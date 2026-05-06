import { expect, test } from '@playwright/test';

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test.beforeEach(async ({ page }) => {
  await expect
    .poll(
      async () => {
        const response = await page.request.get('/api/products?limit=1');
        return response.status();
      },
      { timeout: 30_000 }
    )
    .toBe(200);
});

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
  await expect(
    page.getByRole('button', { name: 'Запросить КП по этой позиции' })
  ).toBeVisible();
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

test('mobile category page keeps search and products ahead of long filters', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto('/catalog/silovoy-kabel');

  await expect(
    page.getByRole('heading', { name: 'Силовой кабель' })
  ).toBeVisible();

  const searchInput = page.getByPlaceholder(
    'Поиск по марке или названию: ВВГнг-LS 3×2.5'
  );
  await expect(searchInput).toBeVisible();

  const filtersButton = page.getByRole('button', { name: /Все параметры/ });
  await expect(filtersButton).toBeVisible();
  await expect(filtersButton).toHaveAttribute('aria-expanded', 'false');

  const firstProduct = page.locator('.product-card').first();
  await expect(firstProduct).toBeVisible();

  const firstScreen = await page.evaluate(() => {
    const search = document
      .querySelector('.catalog-search-bar')
      ?.getBoundingClientRect();
    const product = document
      .querySelector('.product-card')
      ?.getBoundingClientRect();

    return {
      searchTop: search?.top ?? Number.POSITIVE_INFINITY,
      productTop: product?.top ?? Number.POSITIVE_INFINITY,
      viewportHeight: window.innerHeight,
    };
  });

  expect(firstScreen.searchTop).toBeLessThan(firstScreen.viewportHeight);
  expect(firstScreen.productTop).toBeLessThan(firstScreen.viewportHeight);
});
