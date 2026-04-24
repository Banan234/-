import { describe, expect, test } from 'vitest';
import { classifyProduct } from './catalogClassifier.js';
import { normalizeImportedProduct } from './priceParser.js';

function classifyName(name, overrides = {}) {
  const product = normalizeImportedProduct({
    name,
    unit: 'м',
    price: 100,
    stock: 1,
    category: 'Без категории',
    ...overrides,
  });

  return classifyProduct(product);
}

describe('classifyProduct', () => {
  test.each([
    [
      'КПСЭ 2х2х0.75',
      { sourceCategory: 'Кабель связи' },
      {
        catalogCategory: 'Кабели пожарной и охранной сигнализации',
        catalogCategorySlug: 'kabeli-pozharnoy-signalizacii',
        catalogType: 'КПС',
        catalogClassificationSource: 'rule',
      },
    ],
    [
      'H07V-K 1х2.5',
      {},
      {
        catalogCategory: 'Импортные кабели',
        catalogCategorySlug: 'importnye-kabeli',
        catalogApplicationType: 'Провода',
        catalogClassificationSource: 'rule',
      },
    ],
    [
      'ПВВГ нг(А)LS 4х185',
      {},
      {
        catalogCategory: 'Силовой кабель',
        catalogCategorySlug: 'silovoy-kabel',
        catalogType: 'СПЭ',
        catalogClassificationSource: 'rule',
      },
    ],
    [
      'КМПВ 7х0.35',
      {},
      {
        catalogSection: 'Специальные кабели',
        catalogCategory: 'Кабели судовые',
        catalogCategorySlug: 'kabeli-sudovye',
        catalogClassificationSource: 'rule',
      },
    ],
    [
      'КТВ-ХК 2х1.5',
      {},
      {
        catalogSection: 'Специальные кабели',
        catalogCategory: 'Кабели термопарные',
        catalogCategorySlug: 'kabeli-termoparny',
        catalogClassificationSource: 'rule',
      },
    ],
  ])('фиксирует rule-классификацию для %s', (name, overrides, expected) => {
    expect(classifyName(name, overrides)).toMatchObject(expected);
  });

  test('sourceCategory map классифицирует неизвестную марку до keyword/fallback', () => {
    expect(
      classifyName('UNKNOWN 2х1', { sourceCategory: 'Кабель греющий' })
    ).toMatchObject({
      catalogSection: 'Специальные кабели',
      catalogCategory: 'Кабели нагревательные',
      catalogCategorySlug: 'kabeli-nagrevatelnye',
      catalogClassificationSource: 'sourceCategory',
    });
  });

  test('некабельные sourceCategory сворачиваются в единую категорию', () => {
    expect(
      classifyName('Автомат 16А', { sourceCategory: 'Автоматы' })
    ).toMatchObject({
      catalogSection: 'Некабельная продукция',
      catalogCategory: 'Некабельная продукция',
      catalogCategorySlug: 'nekabelnaya-produkciya',
      catalogClassificationSource: 'sourceCategory',
    });
  });

  test('prefix keyword классифицирует обычные провода', () => {
    expect(classifyName('ПуГВ 1х2.5')).toMatchObject({
      catalogCategory: 'Провода',
      catalogCategorySlug: 'provoda',
      catalogClassificationSource: 'keywordPrefix',
      catalogClassificationMatch: 'ПУГВ',
    });
  });

  test('substring keyword работает для марки с посторонним префиксом и дефисом', () => {
    expect(
      classifyProduct({
        name: 'X-RG 6',
        mark: 'X-RG',
        markFamily: 'X-RG',
        sourceCategory: 'Без категории',
      })
    ).toMatchObject({
      catalogCategory: 'Кабели связи',
      catalogCategorySlug: 'kabeli-svyazi',
      catalogClassificationSource: 'keywordSubstring',
      catalogClassificationMatch: 'RG',
    });
  });

  test('brand fallback срабатывает для LAPPKABEL, если нет точного rule', () => {
    expect(
      classifyProduct({
        name: 'LAPPKABEL UNKNOWN 2х1',
        mark: 'LAPPKABEL UNKNOWN',
        markFamily: 'LAPPKABEL UNKNOWN',
        sourceCategory: 'Без категории',
      })
    ).toMatchObject({
      catalogCategory: 'Кабели связи',
      catalogCategorySlug: 'kabeli-svyazi',
      catalogBrand: 'LAPPKABEL',
      catalogClassificationSource: 'brandDefault',
    });
  });

  test('неизвестная марка явно попадает в fallback Прочее', () => {
    expect(classifyName('АОЛ-П-12Y(1х8х1х4)2.7')).toMatchObject({
      catalogSection: 'Кабель и провод',
      catalogCategory: 'Прочее',
      catalogCategorySlug: 'prochee',
      catalogClassificationSource: 'fallback',
      catalogClassificationMatch: null,
    });
  });
});
