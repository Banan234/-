import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const productsFile = path.resolve(__dirname, '..', 'data', 'products.json');
const PLACEHOLDER_IMAGE = '/product-placeholder.svg';
const NON_CABLE_SECTION = {
  name: 'Некабельная продукция',
  slug: 'nekabelnaya-produkciya',
};

let catalogCache = null;

export async function loadCatalogProducts() {
  if (catalogCache) {
    return catalogCache;
  }

  const raw = await fs.readFile(productsFile, 'utf-8');
  const parsed = JSON.parse(raw);

  if (!Array.isArray(parsed)) {
    throw new Error('Файл products.json должен содержать массив товаров');
  }

  catalogCache = parsed
    .filter((item) => normalizeNumber(item?.stock) > 0)
    .map(normalizeCatalogProduct);
  return catalogCache;
}

export async function findProductBySlug(slug) {
  const items = await loadCatalogProducts();

  return items.find((item) => item.slug === slug) || null;
}

function normalizeCatalogProduct(rawProduct) {
  const title = normalizeText(rawProduct.fullName || rawProduct.name || 'Товар');
  const mark = normalizeText(rawProduct.mark || title);
  const category = normalizeText(rawProduct.category || 'Без категории');
  const unit = normalizeText(rawProduct.unit || '');
  const stock = normalizeNumber(rawProduct.stock);
  const price = normalizeNumber(rawProduct.price);
  const catalogPlacement = normalizeCatalogPlacement(rawProduct);

  const id = createStableId(`${title}|${category}|${unit}`);
  const slugBase = slugify(title || mark);
  const sku = `YU-${String(id).padStart(7, '0').slice(-7)}`;

  return {
    id,
    slug: slugBase
      ? `${slugBase}-${id.toString(36)}`
      : `product-${id.toString(36)}`,
    sku,
    title,
    fullName: title,
    name: normalizeText(rawProduct.name || title),
    mark,
    markFamily: normalizeText(rawProduct.markFamily || ''),
    category,
    price,
    unit,
    stock,
    shortDescription: buildShortDescription(rawProduct),
    description: buildDescription(rawProduct, category, unit, stock),
    image: PLACEHOLDER_IMAGE,
    specs: buildSpecs(rawProduct, unit, stock),
    inStock: stock > 0,
    leadTime: stock > 0 ? 'Со склада' : 'Под заказ',
    manufacturer: normalizeText(rawProduct.manufacturer || '') || null,
    catalogBrand: normalizeText(rawProduct.catalogBrand || '') || null,
    cores: rawProduct.cores ?? null,
    crossSection: rawProduct.crossSection ?? null,
    hasGroundCore: Boolean(rawProduct.hasGroundCore),
    groundCores: rawProduct.groundCores ?? null,
    groundSection: rawProduct.groundSection ?? null,
    voltage: rawProduct.voltage ?? null,
    attributes: getAttributes(rawProduct),
    sourceCategory: normalizeText(rawProduct.sourceCategory || ''),
    catalogSection: catalogPlacement.section,
    catalogSectionSlug: catalogPlacement.sectionSlug,
    catalogCategory: catalogPlacement.category,
    catalogCategorySlug: catalogPlacement.categorySlug,
    catalogType: normalizeText(rawProduct.catalogType || ''),
    catalogApplicationType: normalizeText(rawProduct.catalogApplicationType || '') || null,
    cableDecoded: rawProduct.cableDecoded ?? null,
  };
}

const CABLE_SECTIONS = new Set(['Кабель и провод', 'Специальные кабели']);

function normalizeCatalogPlacement(rawProduct) {
  const section = normalizeText(rawProduct.catalogSection || 'Прочее');
  const sectionSlug = normalizeText(rawProduct.catalogSectionSlug || 'prochee');
  const category = normalizeLegacyCatalogCategory(
    normalizeText(rawProduct.catalogCategory || 'Прочее')
  );
  const categorySlug = normalizeLegacyCatalogCategorySlug(
    normalizeText(rawProduct.catalogCategorySlug || 'prochee')
  );

  if (section && !CABLE_SECTIONS.has(section)) {
    return {
      section: NON_CABLE_SECTION.name,
      sectionSlug: NON_CABLE_SECTION.slug,
      category: NON_CABLE_SECTION.name,
      categorySlug: NON_CABLE_SECTION.slug,
    };
  }

  return {
    section,
    sectionSlug,
    category,
    categorySlug,
  };
}

function normalizeLegacyCatalogCategory(value) {
  return value === 'Монтажный провод' ? 'Монтажный кабель' : value;
}

function normalizeLegacyCatalogCategorySlug(value) {
  return value === 'montazhnyy-provod' ? 'montazhnyy-kabel' : value;
}

function buildShortDescription(rawProduct) {
  const parts = [];

  if (rawProduct.mark) {
    parts.push(normalizeText(rawProduct.mark));
  }

  if (rawProduct.cores && rawProduct.crossSection) {
    parts.push(
      `${rawProduct.cores}х${formatNumber(rawProduct.crossSection)} мм2`
    );
  } else if (rawProduct.crossSection) {
    parts.push(`${formatNumber(rawProduct.crossSection)} мм2`);
  }

  if (
    getAttributes(rawProduct).length > 0
  ) {
    parts.push(getAttributes(rawProduct).join(', '));
  }

  return parts.join(' · ') || 'Позиция из актуального прайс-листа.';
}

function buildDescription(rawProduct, category, unit, stock) {
  const fragments = [
    'Позиция загружена из актуального прайс-листа поставщика.',
    `Категория: ${category}.`,
  ];

  if (unit) {
    fragments.push(`Единица измерения: ${unit}.`);
  }

  if (stock > 0) {
    fragments.push(
      `Текущий остаток: ${formatNumber(stock)} ${unit || ''}`.trim() + '.'
    );
  } else {
    fragments.push('Текущий остаток отсутствует, возможна поставка под заказ.');
  }

  if (rawProduct.voltage) {
    fragments.push(
      `Номинальное напряжение: ${formatNumber(rawProduct.voltage)} кВ.`
    );
  }

  return fragments.join(' ');
}

function buildSpecs(rawProduct, unit, stock) {
  const specs = {};

  if (rawProduct.mark) {
    specs['Марка'] = normalizeText(rawProduct.mark);
  }

  if (rawProduct.cores) {
    specs['Количество жил'] = String(rawProduct.cores);
  }

  if (rawProduct.crossSection) {
    specs['Сечение жилы'] = `${formatNumber(rawProduct.crossSection)} мм2`;
  }

  if (rawProduct.groundCores && rawProduct.groundSection) {
    specs['Доп. жила'] =
      `${rawProduct.groundCores}х${formatNumber(rawProduct.groundSection)} мм2`;
  }

  if (rawProduct.voltage) {
    specs['Напряжение'] = `${formatNumber(rawProduct.voltage)} кВ`;
  }

  if (unit) {
    specs['Ед. изм.'] = unit;
  }

  specs['Остаток'] = `${formatNumber(stock)}${unit ? ` ${unit}` : ''}`;

  const attributes = getAttributes(rawProduct);

  if (attributes.length > 0) {
    specs['Особенности'] = attributes.join(', ');
  }

  return specs;
}

function normalizeText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getAttributes(rawProduct) {
  return Array.isArray(rawProduct.attributes) ? rawProduct.attributes : [];
}

function normalizeNumber(value) {
  const numeric = Number(value);

  return Number.isFinite(numeric) ? numeric : 0;
}

function formatNumber(value) {
  return Number(value).toLocaleString('ru-RU', {
    maximumFractionDigits: 3,
  });
}

function createStableId(value) {
  let hash = 2166136261;

  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }

  return Math.abs(hash >>> 0);
}

function slugify(value) {
  const transliterated = transliterate(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return transliterated;
}

function transliterate(value) {
  const map = {
    а: 'a',
    б: 'b',
    в: 'v',
    г: 'g',
    д: 'd',
    е: 'e',
    ё: 'e',
    ж: 'zh',
    з: 'z',
    и: 'i',
    й: 'y',
    к: 'k',
    л: 'l',
    м: 'm',
    н: 'n',
    о: 'o',
    п: 'p',
    р: 'r',
    с: 's',
    т: 't',
    у: 'u',
    ф: 'f',
    х: 'h',
    ц: 'ts',
    ч: 'ch',
    ш: 'sh',
    щ: 'sch',
    ъ: '',
    ы: 'y',
    ь: '',
    э: 'e',
    ю: 'yu',
    я: 'ya',
  };

  return [...String(value || '')]
    .map((character) => {
      const lower = character.toLowerCase();
      return map[lower] ?? character;
    })
    .join('');
}
