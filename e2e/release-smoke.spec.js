import { expect, test } from '@playwright/test';

const ROUTES = ['/', '/catalog', '/contacts', '/product/e2e-vvgng-ls-3x2-5'];

const IGNORED_RESPONSE_TYPES = new Set(['fetch', 'xhr', 'websocket']);

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

async function collectReleaseSmokeSignals(page) {
  const consoleIssues = [];
  const assetFailures = [];
  const pageErrors = [];

  page.on('console', (message) => {
    if (!['warning', 'error'].includes(message.type())) return;

    const text = message.text();
    if (/Download the React DevTools/i.test(text)) return;
    if (/GL Driver Message .*GPU stall due to ReadPixels/i.test(text)) return;

    consoleIssues.push(`${message.type()}: ${text}`);
  });

  page.on('pageerror', (error) => {
    pageErrors.push(error.message);
  });

  page.on('response', (response) => {
    const request = response.request();
    const status = response.status();
    const resourceType = request.resourceType();

    if (
      status === 404 &&
      !IGNORED_RESPONSE_TYPES.has(resourceType) &&
      response.url().startsWith(page.context()._options.baseURL)
    ) {
      assetFailures.push(`${status} ${resourceType}: ${response.url()}`);
    }
  });

  return { assetFailures, consoleIssues, pageErrors };
}

async function getBrokenImages(page) {
  return page.evaluate(() => {
    return Array.from(document.images)
      .filter((image) => image.currentSrc && image.naturalWidth === 0)
      .map((image) => image.currentSrc);
  });
}

async function getObviousA11yIssues(page) {
  return page.evaluate(() => {
    const issues = [];

    for (const image of document.querySelectorAll('img')) {
      if (!image.hasAttribute('alt')) {
        issues.push(`img without alt: ${image.currentSrc || image.src}`);
      }
    }

    for (const control of document.querySelectorAll(
      'button, input, select, textarea'
    )) {
      const tag = control.tagName.toLowerCase();
      const style = window.getComputedStyle(control);
      const type = control.getAttribute('type');
      const isHiddenInput = tag === 'input' && type === 'hidden';
      const isHidden =
        isHiddenInput ||
        control.closest('[aria-hidden="true"]') ||
        style.display === 'none' ||
        style.visibility === 'hidden';
      const hasText = control.textContent.trim().length > 0;
      const hasAriaLabel =
        control.hasAttribute('aria-label') ||
        control.hasAttribute('aria-labelledby');
      const hasLabel =
        control.closest('label') ||
        (control.id &&
          document.querySelector(`label[for="${CSS.escape(control.id)}"]`));

      if (!isHidden && !hasText && !hasAriaLabel && !hasLabel) {
        issues.push(`${tag} without accessible label`);
      }
    }

    return issues;
  });
}

test.describe('release smoke', () => {
  for (const route of ROUTES) {
    test(`${route} has clean console, assets and obvious accessibility`, async ({
      page,
    }) => {
      const signals = await collectReleaseSmokeSignals(page);

      await page.goto(route, { waitUntil: 'networkidle' });

      await expect(page.locator('#root')).toBeVisible();
      expect(await getBrokenImages(page)).toEqual([]);
      expect(await getObviousA11yIssues(page)).toEqual([]);
      expect(signals.pageErrors).toEqual([]);
      expect(signals.consoleIssues).toEqual([]);
      expect(signals.assetFailures).toEqual([]);
    });
  }
});
