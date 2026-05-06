// Файл проверяет генерацию meta description и ограничения длины для разных типов страниц.

import { describe, expect, it } from 'vitest';
import {
  META_DESCRIPTION_MAX_LENGTH,
  normalizeMetaDescription,
} from './metaDescription.js';
import { buildProductMetaDescription } from './productSeo.js';

describe('normalizeMetaDescription', () => {
  it('схлопывает пробелы и не трогает короткое описание', () => {
    expect(
      normalizeMetaDescription('  Поставка   кабеля\nсо склада\tв Челябинске. ')
    ).toBe('Поставка кабеля со склада в Челябинске.');
  });

  it('ограничивает описание 160 символами и режет по границе слова', () => {
    const description = normalizeMetaDescription(
      [
        'Кабель ВВГнг(A)-LS 5х10 в наличии на складе в Челябинске',
        'для подрядчиков, строительных компаний, промышленных предприятий',
        'и снабженцев с быстрой подготовкой коммерческого предложения.',
      ].join(' ')
    );

    expect(description.length).toBeLessThanOrEqual(META_DESCRIPTION_MAX_LENGTH);
    expect(description).toMatch(/\.\.\.$/);
    expect(description).not.toMatch(/\s\.\.\.$/);
    expect(description).not.toContain('коммерческого предложения');
  });

  it('режет длинное слово без превышения лимита', () => {
    const description = normalizeMetaDescription('А'.repeat(220));

    expect(description).toHaveLength(META_DESCRIPTION_MAX_LENGTH);
    expect(description).toMatch(/\.\.\.$/);
  });
});

describe('buildProductMetaDescription', () => {
  it('возвращает meta-safe описание товара', () => {
    const description = buildProductMetaDescription({
      fullName: 'Кабель ВВГнг(A)-LS 5х10',
      catalogCategory: 'Силовой кабель',
      description: 'Кабель   ВВГнг(A)-LS 5х10 '.repeat(12),
    });

    expect(description.length).toBeLessThanOrEqual(META_DESCRIPTION_MAX_LENGTH);
    expect(description).not.toContain('  ');
  });

  it('усиливает короткое описание товара характеристиками и коммерческим контекстом', () => {
    const description = buildProductMetaDescription({
      fullName: 'АВБбШв 4х50',
      catalogCategory: 'Силовой кабель',
      cores: 4,
      crossSection: 50,
      price: 258.9,
      unit: 'м',
    });

    expect(description.length).toBeGreaterThanOrEqual(80);
    expect(description.length).toBeLessThanOrEqual(META_DESCRIPTION_MAX_LENGTH);
    expect(description).toContain('Силовой кабель');
    expect(description).toContain('сечение 50 мм²');
    expect(description).toContain('Цена от 258,9 ₽/м');
  });
});
