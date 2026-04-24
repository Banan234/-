import { describe, expect, test } from 'vitest';
import {
  buildCategoryMap,
  normalizeImportedProduct,
  parseCombinedCell,
  parseProductName,
  resolveCategory,
} from './priceParser.js';

describe('parseProductName', () => {
  test('разбирает простой кабель ВВГ 3х2.5', () => {
    expect(parseProductName('ВВГ 3х2.5')).toMatchObject({
      mark: 'ВВГ',
      markFamily: 'ВВГ',
      cores: 3,
      crossSection: 2.5,
      hasGroundCore: false,
      voltage: null,
    });
  });

  test('распознаёт запятую как разделитель дробной части', () => {
    expect(parseProductName('ВВГнг(А)-LS 3х2,5')).toMatchObject({
      mark: 'ВВГнг(А)-LS',
      cores: 3,
      crossSection: 2.5,
    });
  });

  test('поддерживает латинскую x и кириллическую х', () => {
    expect(parseProductName('ВВГ 3x2.5').crossSection).toBe(2.5);
    expect(parseProductName('ВВГ 3х2.5').crossSection).toBe(2.5);
    expect(parseProductName('ВВГ 3×2.5').crossSection).toBe(2.5);
  });

  test('распознаёт жилу заземления через +', () => {
    const parsed = parseProductName('ВВГ 3х2.5 + 1х1.5');
    expect(parsed).toMatchObject({
      cores: 3,
      crossSection: 2.5,
      hasGroundCore: true,
      groundCores: 1,
      groundSection: 1.5,
    });
  });

  test('извлекает напряжение (0.66 кВ)', () => {
    expect(parseProductName('АВВГ 4х16 0.66кВ').voltage).toBe(0.66);
    expect(parseProductName('АВВГ 4х16 1кВ').voltage).toBe(1);
  });

  test('выделяет производителя-префикс (SIEMENS)', () => {
    const parsed = parseProductName('SIEMENS 2х2х0.32');
    expect(parsed.manufacturer).toBe('SIEMENS');
    // Когда марка пустая после срезания префикса — используем производителя
    expect(parsed.mark).toBe('SIEMENS');
  });

  test('выделяет производителя но сохраняет марку после него', () => {
    const parsed = parseProductName('HELUKABEL F-CY-JZ 2х1');
    expect(parsed.manufacturer).toBe('HELUKABEL');
    expect(parsed.mark).toBe('F-CY-JZ');
    expect(parsed.cores).toBe(2);
    expect(parsed.crossSection).toBe(1);
  });

  test('нормализует нгLS → нг-LS в атрибутах', () => {
    const parsed = parseProductName('ВВГ 3х2.5 нгLS');
    expect(parsed.attributes).toContain('нг-LS');
  });

  test('нормализует нг(А)LSLtx → нг(А)-LS-LTx', () => {
    const parsed = parseProductName('ВВГ 3х2.5 нг(А)LSLtx');
    expect(parsed.attributes.join(' ')).toContain('нг(А)-LS-LTx');
  });

  test('одножильный кабель без х: "ПуГВ 2.5" → 1х2.5', () => {
    const parsed = parseProductName('ПуГВ 2.5');
    expect(parsed).toMatchObject({
      mark: 'ПуГВ',
      cores: 1,
      crossSection: 2.5,
      isImplicitSingleCore: true,
    });
  });

  test('пустая строка возвращает пустые поля', () => {
    expect(parseProductName('')).toMatchObject({
      mark: '',
      markFamily: '',
      cores: null,
      crossSection: null,
    });
  });
});

describe('parseCombinedCell', () => {
  test('парсит строку с единицей, ценой и остатком на конце', () => {
    expect(parseCombinedCell('ВВГ 3х2.5 м 123.50 5')).toEqual({
      name: 'ВВГ 3х2.5',
      unit: 'м',
      price: 123.5,
      stock: 5,
    });
  });

  test('работает без единицы измерения в строке', () => {
    expect(parseCombinedCell('Кабель АБВ 100.5 0.02')).toMatchObject({
      name: 'Кабель АБВ',
      price: 100.5,
      stock: 0.02,
    });
  });

  test('не считает заголовок раздела товаром (нет хвоста цена+остаток)', () => {
    // Раньше этот баг давал фейковый товар с price=1, stock=3
    expect(
      parseCombinedCell('Провод медный ПВ1,ПВ3,ПУВ,ПУГВ,ПГВА')
    ).toBeNull();
  });

  test('возвращает null для названия без цены/остатка на конце', () => {
    expect(parseCombinedCell('Кабель КВПЭфВП-5е')).toBeNull();
  });

  test('возвращает null для пустой строки', () => {
    expect(parseCombinedCell('')).toBeNull();
    expect(parseCombinedCell(null)).toBeNull();
  });

  test('парсит формат с запятой как разделителем тысяч в цене', () => {
    const result = parseCombinedCell('ВВГ 3х2.5 км 36,600 0.183');
    expect(result).toMatchObject({
      unit: 'км',
      price: 36600,
      stock: 0.183,
    });
  });
});

describe('normalizeImportedProduct', () => {
  test('пересчитывает цену и остаток из км в м', () => {
    const result = normalizeImportedProduct({
      name: 'ВВГ 3х2.5',
      unit: 'км',
      price: 100000,
      stock: 1,
      category: 'Кабель ВВГ',
    });
    expect(result.unit).toBe('м');
    expect(result.price).toBe(100);
    expect(result.stock).toBe(1000);
  });

  test('«штука» сокращается до «шт»', () => {
    const result = normalizeImportedProduct({
      name: 'Автомат',
      unit: 'штука',
      price: 100,
      stock: 1,
    });
    expect(result.unit).toBe('шт');
  });

  test('заполняет mark/markFamily для кабеля', () => {
    const result = normalizeImportedProduct({
      name: 'ВВГ 3х2.5',
      unit: 'м',
      price: 100,
      stock: 1,
    });
    expect(result.mark).toBe('ВВГ');
    expect(result.markFamily).toBe('ВВГ');
    expect(result.cores).toBe(3);
    expect(result.crossSection).toBe(2.5);
  });

  test('сохраняет sourceCategory отдельно от category', () => {
    const result = normalizeImportedProduct({
      name: 'ВВГ 3х2.5',
      category: 'Кабель ВВГ',
      sourceCategory: 'Кабели силовые',
      unit: 'м',
      price: 100,
      stock: 1,
    });
    expect(result.sourceCategory).toBe('Кабели силовые');
    expect(result.category).toBe('Кабель ВВГ');
  });
});

describe('resolveCategory', () => {
  test('использует sourceCategory если она совместима с семейством', () => {
    const product = {
      mark: 'ВВГ',
      markFamily: 'ВВГ',
      sourceCategory: 'Кабель ВВГ, ВВГнг',
      name: 'ВВГ 3х2.5 нг',
    };
    expect(resolveCategory(product)).toBe('Кабель ВВГ, ВВГнг');
  });

  test('товары с суффиксом в марке (ВВГнг(А)-LS без пробела) получают свою категорию', () => {
    // Известное ограничение: когда в прайсе нет пробела между базовой маркой
    // и суффиксом, markFamily уходит вместе с суффиксом и не матчится на
    // базовую категорию «Кабель ВВГ, ВВГнг». Обычно в прайсе пробел есть,
    // и mark остаётся «ВВГ» — этот путь покрыт тестом выше.
    const product = {
      mark: 'ВВГнг(А)-LS',
      markFamily: 'ВВГНГ(А)-LS',
      sourceCategory: 'Без категории',
      name: 'ВВГнг(А)-LS 3х2.5',
    };
    expect(resolveCategory(product)).toBe('Кабель ВВГнг(А)-LS');
  });

  test('игнорирует несовместимую sourceCategory и применяет алиас', () => {
    // «Гидротолкатели» пришли по соседству в прайсе, но семейство — Энерготерм
    const product = {
      mark: 'Энерготерм-600',
      markFamily: 'ЭНЕРГОТЕРМ-600',
      sourceCategory: 'Гидротолкатели',
      name: 'Энерготерм-600 2х2.5',
    };
    const resolved = resolveCategory(product);
    expect(resolved).not.toBe('Гидротолкатели');
    expect(resolved.toLowerCase()).toContain('энерготерм');
  });

  test('применяет алиас для NYM → "Кабель NYY, NUM"', () => {
    const product = {
      mark: 'NYM',
      markFamily: 'NYM',
      sourceCategory: 'Без категории',
      name: 'NYM 3х1.5',
    };
    expect(resolveCategory(product)).toBe('Кабель NYY, NUM');
  });

  test('возвращает "Без категории" для пустого товара', () => {
    expect(resolveCategory({ mark: '', markFamily: '', name: '' })).toBe(
      'Без категории'
    );
  });
});

describe('buildCategoryMap', () => {
  test('выбирает самую частую совместимую категорию для семейства', () => {
    const products = [
      { markFamily: 'ВВГ', sourceCategory: 'Кабель ВВГ, ВВГнг' },
      { markFamily: 'ВВГ', sourceCategory: 'Кабель ВВГ, ВВГнг' },
      { markFamily: 'ВВГ', sourceCategory: 'Кабель ВВГ' },
    ];
    const map = buildCategoryMap(products);
    expect(map.get('ВВГ')).toBe('Кабель ВВГ, ВВГнг');
  });

  test('пропускает несовместимые категории', () => {
    const products = [
      { markFamily: 'ВВГ', sourceCategory: 'Гидротолкатели' },
      { markFamily: 'ВВГ', sourceCategory: 'Кабель ВВГ' },
    ];
    const map = buildCategoryMap(products);
    expect(map.get('ВВГ')).toBe('Кабель ВВГ');
  });
});
