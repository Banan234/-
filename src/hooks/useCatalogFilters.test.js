import { describe, expect, it } from 'vitest';
import {
  buildCatalogProductQueryOptions,
  parseCatalogFilters,
} from './useCatalogFilters.js';

describe('catalog filter URL parsing', () => {
  it('normalizes CSV, numeric CSV and boolean filter params', () => {
    const filters = parseCatalogFilters(
      new URLSearchParams(
        'category=kabel&search=ВВГ&priceMin=10&priceMax=nope&material=медь, алюминий&section=2.5,bad,4&voltage=0.66,1&appType=силовой&spe=1&sort=price-asc'
      )
    );

    expect(filters).toMatchObject({
      category: 'kabel',
      search: 'ВВГ',
      priceMin: '10',
      priceMax: 'nope',
      priceMinNumber: 10,
      priceMaxNumber: null,
      sortBy: 'price-asc',
      selectedMaterials: ['медь', 'алюминий'],
      selectedSections: [2.5, 4],
      selectedVoltages: [0.66, 1],
      selectedAppTypes: ['силовой'],
      onlySPE: true,
    });
  });

  it('builds API query options with optional advanced filters', () => {
    const params = new URLSearchParams(
      'search=ВВГ&material=медь&appType=силовой&spe=1&page=2&category=ignored'
    );

    expect(buildCatalogProductQueryOptions(params, { limit: 24 })).toEqual({
      limit: 24,
      search: 'ВВГ',
      material: 'медь',
      page: '2',
    });
    expect(
      buildCatalogProductQueryOptions(params, {
        limit: 24,
        includeAdvancedFilters: true,
      })
    ).toEqual({
      limit: 24,
      search: 'ВВГ',
      material: 'медь',
      appType: 'силовой',
      spe: '1',
      page: '2',
    });
  });
});
