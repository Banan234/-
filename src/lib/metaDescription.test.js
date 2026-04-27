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
});
