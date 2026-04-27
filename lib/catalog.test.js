import { describe, expect, it } from 'vitest';
import { createCatalogStore } from './catalog.js';

const PRODUCTS_FILE = 'products.json';
const PRICE_OVERRIDES_FILE = 'priceOverrides.json';
const CATALOG_OVERRIDES_FILE = 'catalogOverrides.json';

function createMemoryFs(initialFiles) {
  const files = new Map(Object.entries(initialFiles));

  return {
    setFile(filePath, body, mtimeMs) {
      files.set(filePath, { body, mtimeMs });
    },
    async stat(filePath) {
      const file = files.get(filePath);
      if (!file) {
        const error = new Error(`ENOENT: ${filePath}`);
        error.code = 'ENOENT';
        throw error;
      }
      return { mtimeMs: file.mtimeMs };
    },
    async readFile(filePath) {
      const file = files.get(filePath);
      if (!file) {
        const error = new Error(`ENOENT: ${filePath}`);
        error.code = 'ENOENT';
        throw error;
      }
      return file.body;
    },
  };
}

function createProduct(overrides = {}) {
  return {
    id: 1,
    slug: 'alpha-cable',
    sku: 'SKU-1',
    fullName: 'Alpha Cable',
    name: 'Alpha Cable',
    mark: 'ALPHA',
    category: 'Power',
    unit: 'm',
    stock: 10,
    price: 100,
    catalogSection: 'Кабель и провод',
    catalogSectionSlug: 'kabel-i-provod',
    catalogCategory: 'Power cable',
    catalogCategorySlug: 'power-cable',
    ...overrides,
  };
}

function createStoreFixture({
  products = [createProduct()],
  image = '/alpha-a.svg',
  catalogOverrides = {},
} = {}) {
  const fs = createMemoryFs({
    [PRODUCTS_FILE]: { body: JSON.stringify(products), mtimeMs: 1 },
    [PRICE_OVERRIDES_FILE]: {
      body: JSON.stringify({
        overrides: {
          'Alpha Cable': { image },
        },
      }),
      mtimeMs: 1,
    },
    [CATALOG_OVERRIDES_FILE]: {
      body: JSON.stringify(catalogOverrides),
      mtimeMs: 1,
    },
  });
  const store = createCatalogStore({
    fs,
    productsFile: PRODUCTS_FILE,
    overridesFile: PRICE_OVERRIDES_FILE,
    catalogOverridesFile: CATALOG_OVERRIDES_FILE,
  });

  return { fs, store };
}

describe('createCatalogStore', () => {
  it('keeps image overrides isolated between store instances', async () => {
    const first = createStoreFixture({ image: '/alpha-a.svg' });
    const second = createStoreFixture({ image: '/alpha-b.svg' });

    expect((await first.store.loadCatalogProducts())[0].image).toBe(
      '/alpha-a.svg'
    );
    expect((await second.store.loadCatalogProducts())[0].image).toBe(
      '/alpha-b.svg'
    );
    expect(first.store.getCatalogProductListItems()[0].image).toBe(
      '/alpha-a.svg'
    );
  });

  it('reloads products when image override mtime changes', async () => {
    const { fs, store } = createStoreFixture({ image: '/alpha-a.svg' });

    expect((await store.loadCatalogProducts())[0].image).toBe('/alpha-a.svg');

    fs.setFile(
      PRICE_OVERRIDES_FILE,
      JSON.stringify({
        overrides: {
          'Alpha Cable': { image: '/alpha-next.svg' },
        },
      }),
      2
    );

    expect((await store.loadCatalogProducts())[0].image).toBe(
      '/alpha-next.svg'
    );
  });

  it('applies catalog overrides and scoped category indexes', async () => {
    const hiddenProduct = createProduct({
      id: 2,
      slug: 'hidden-cable',
      sku: 'SKU-HIDDEN',
      fullName: 'Hidden Cable',
      name: 'Hidden Cable',
      catalogCategorySlug: 'hidden-cable',
    });
    const { store } = createStoreFixture({
      products: [createProduct(), hiddenProduct],
      catalogOverrides: {
        hide: [{ sku: 'SKU-HIDDEN' }],
        promote: [{ sku: 'SKU-1' }],
      },
    });

    const items = await store.loadCatalogProducts();

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ sku: 'SKU-1', promoted: true });
    expect(store.getCatalogProductsByCategory('power-cable')).toEqual(items);
    expect(store.getCatalogProductListItemsByCategory('power-cable')).toEqual([
      expect.objectContaining({ sku: 'SKU-1', image: '/alpha-a.svg' }),
    ]);
  });

  it('reset clears loaded state for tests', async () => {
    const { store } = createStoreFixture();

    await store.loadCatalogProducts();
    expect(store.getCatalogProductListItems()).toHaveLength(1);

    store.reset();

    expect(store.getCatalogProductListItems()).toEqual([]);
  });
});
