import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const productsFile = path.resolve(__dirname, '..', 'data', 'products.json');
const overridesFile = path.resolve(
  __dirname,
  '..',
  'data',
  'priceOverrides.json'
);
const catalogOverridesFile = path.resolve(
  __dirname,
  '..',
  'data',
  'catalogOverrides.json'
);
const PLACEHOLDER_IMAGE = '/product-placeholder.svg';
const POWER_CABLE_IMAGE = '/category-placeholders/power-cable.svg';
const CONTROL_CABLE_IMAGE = '/category-placeholders/control-cable.svg';
const COMMUNICATION_CABLE_IMAGE = '/category-placeholders/communication-cable.svg';
const FLEXIBLE_CABLE_IMAGE = '/category-placeholders/flexible-cable.svg';
const CATEGORY_IMAGES = {
  'silovoy-kabel': POWER_CABLE_IMAGE,
  'kontrolnyy-kabel': CONTROL_CABLE_IMAGE,
  'montazhnyy-kabel': CONTROL_CABLE_IMAGE,
  provoda: POWER_CABLE_IMAGE,
  sip: POWER_CABLE_IMAGE,
  'kabeli-svyazi': COMMUNICATION_CABLE_IMAGE,
  'kabeli-pozharnoy-signalizacii': COMMUNICATION_CABLE_IMAGE,
  'importnye-kabeli': POWER_CABLE_IMAGE,
  'gibkiy-kabel': FLEXIBLE_CABLE_IMAGE,
  'kabeli-shakhtnye': POWER_CABLE_IMAGE,
  'kabeli-podvizhnogo-sostava': FLEXIBLE_CABLE_IMAGE,
  'kabeli-neftepogr': POWER_CABLE_IMAGE,
  'bortovye-provoda': FLEXIBLE_CABLE_IMAGE,
  'kabeli-nagrevatelnye': POWER_CABLE_IMAGE,
  'lan-kabeli': COMMUNICATION_CABLE_IMAGE,
  'kabeli-sudovye': POWER_CABLE_IMAGE,
  'kabeli-termoparny': CONTROL_CABLE_IMAGE,
  'kabel-vodopogr': POWER_CABLE_IMAGE,
};
const NON_CABLE_SECTION = {
  name: 'Некабельная продукция',
  slug: 'nekabelnaya-produkciya',
};

let catalogCache = null;
let catalogCacheMtime = 0;
let catalogCacheOverridesMtime = 0;
let catalogCacheCatalogOverridesMtime = 0;
let imageOverrides = {};
let imageMatchers = [];
let catalogOverrides = {
  hide: [],
  rename: [],
  merge: [],
  promote: [],
};

function normalizeMarkKey(value) {
  return String(value || '')
    .replace(/\s+/g, '')
    .toLowerCase();
}

async function loadImageOverrides() {
  try {
    const stat = await fs.stat(overridesFile);

    if (stat.mtimeMs === catalogCacheOverridesMtime) {
      return { mtime: stat.mtimeMs, changed: false };
    }

    const raw = await fs.readFile(overridesFile, 'utf-8');
    const parsed = JSON.parse(raw);
    const overrides = parsed?.overrides || {};
    const next = {};
    for (const [key, value] of Object.entries(overrides)) {
      if (value && typeof value.image === 'string' && value.image) {
        next[key] = value.image;
      }
    }
    imageOverrides = next;
    const matchers = Array.isArray(parsed?.matchers) ? parsed.matchers : [];
    imageMatchers = matchers
      .filter((m) => m && typeof m === 'object' && typeof m.image === 'string' && m.image)
      .map((m) => ({
        mark: normalizeMarkKey(m.mark),
        cores: m.cores != null ? Number(m.cores) : null,
        crossSection: m.crossSection != null ? Number(m.crossSection) : null,
        voltage: m.voltage != null ? Number(m.voltage) : null,
        image: m.image,
      }));
    return { mtime: stat.mtimeMs, changed: true };
  } catch {
    imageOverrides = {};
    imageMatchers = [];
    return { mtime: 0, changed: catalogCacheOverridesMtime !== 0 };
  }
}

function findImageByMatcher(rawProduct) {
  if (imageMatchers.length === 0) return null;
  const mark = normalizeMarkKey(rawProduct.mark);
  if (!mark) return null;
  const match = imageMatchers.find((m) => {
    if (m.mark !== mark) return false;
    if (m.cores != null && m.cores !== Number(rawProduct.cores)) return false;
    if (m.crossSection != null && m.crossSection !== Number(rawProduct.crossSection)) {
      return false;
    }
    if (m.voltage != null && m.voltage !== Number(rawProduct.voltage)) return false;
    return true;
  });
  return match ? match.image : null;
}

async function loadCatalogOverrides() {
  try {
    const stat = await fs.stat(catalogOverridesFile);

    if (stat.mtimeMs === catalogCacheCatalogOverridesMtime) {
      return { mtime: stat.mtimeMs, changed: false };
    }

    const raw = await fs.readFile(catalogOverridesFile, 'utf-8');
    const parsed = JSON.parse(raw);
    catalogOverrides = {
      hide: Array.isArray(parsed?.hide) ? parsed.hide : [],
      rename: Array.isArray(parsed?.rename) ? parsed.rename : [],
      merge: Array.isArray(parsed?.merge) ? parsed.merge : [],
      promote: Array.isArray(parsed?.promote) ? parsed.promote : [],
    };
    return { mtime: stat.mtimeMs, changed: true };
  } catch {
    const wasLoaded = catalogCacheCatalogOverridesMtime !== 0;
    catalogOverrides = { hide: [], rename: [], merge: [], promote: [] };
    return { mtime: 0, changed: wasLoaded };
  }
}

function matcherMatches(matcher, product) {
  if (!matcher || typeof matcher !== 'object') return false;
  if (typeof matcher.slug === 'string' && matcher.slug) {
    return product.slug === matcher.slug;
  }
  if (typeof matcher.sku === 'string' && matcher.sku) {
    return product.sku === matcher.sku;
  }
  if (typeof matcher.name === 'string' && matcher.name) {
    return product.name === matcher.name || product.fullName === matcher.name;
  }
  if (matcher.mark) {
    if (normalizeMarkKey(matcher.mark) !== normalizeMarkKey(product.mark)) return false;
    if (matcher.cores != null && Number(matcher.cores) !== Number(product.cores)) {
      return false;
    }
    if (
      matcher.crossSection != null &&
      Number(matcher.crossSection) !== Number(product.crossSection)
    ) {
      return false;
    }
    if (matcher.voltage != null && Number(matcher.voltage) !== Number(product.voltage)) {
      return false;
    }
    return true;
  }
  return false;
}

function applyCatalogOverrides(products) {
  let items = products;

  if (catalogOverrides.hide.length > 0) {
    items = items.filter(
      (product) => !catalogOverrides.hide.some((m) => matcherMatches(m, product))
    );
  }

  if (catalogOverrides.merge.length > 0) {
    const toRemove = new Set();
    for (const rule of catalogOverrides.merge) {
      if (!rule || !rule.target || !Array.isArray(rule.sources)) continue;
      const target = items.find((p) => matcherMatches(rule.target, p));
      if (!target) continue;
      for (const sourceMatcher of rule.sources) {
        for (const candidate of items) {
          if (candidate === target || toRemove.has(candidate)) continue;
          if (!matcherMatches(sourceMatcher, candidate)) continue;
          toRemove.add(candidate);
          if (rule.sumStock) {
            target.stock = (target.stock || 0) + (candidate.stock || 0);
            target.inStock = target.stock > 0;
          }
        }
      }
    }
    if (toRemove.size > 0) {
      items = items.filter((p) => !toRemove.has(p));
    }
  }

  if (catalogOverrides.rename.length > 0) {
    for (const rule of catalogOverrides.rename) {
      if (!rule || !rule.match) continue;
      for (const product of items) {
        if (!matcherMatches(rule.match, product)) continue;
        if (typeof rule.name === 'string' && rule.name) {
          product.name = rule.name;
        }
        if (typeof rule.fullName === 'string' && rule.fullName) {
          product.fullName = rule.fullName;
          product.title = rule.fullName;
        }
        if (typeof rule.shortDescription === 'string') {
          product.shortDescription = rule.shortDescription;
        }
      }
    }
  }

  if (catalogOverrides.promote.length > 0) {
    for (const product of items) {
      if (catalogOverrides.promote.some((m) => matcherMatches(m, product))) {
        product.promoted = true;
      }
    }
  }

  return items;
}

export async function loadCatalogProducts() {
  const [stat, overridesState, catalogOverridesState] = await Promise.all([
    fs.stat(productsFile),
    loadImageOverrides(),
    loadCatalogOverrides(),
  ]);

  if (
    catalogCache &&
    stat.mtimeMs === catalogCacheMtime &&
    !overridesState.changed &&
    !catalogOverridesState.changed
  ) {
    return catalogCache;
  }

  const raw = await fs.readFile(productsFile, 'utf-8');
  const parsed = JSON.parse(raw);

  if (!Array.isArray(parsed)) {
    throw new Error('Файл products.json должен содержать массив товаров');
  }

  const normalized = parsed
    .filter((item) => normalizeNumber(item?.stock) > 0)
    .map(normalizeCatalogProduct);
  catalogCache = applyCatalogOverrides(normalized);
  catalogCacheMtime = stat.mtimeMs;
  catalogCacheOverridesMtime = overridesState.mtime;
  catalogCacheCatalogOverridesMtime = catalogOverridesState.mtime;
  return catalogCache;
}

export async function getCatalogMtime() {
  const stat = await fs.stat(productsFile);
  return stat.mtimeMs;
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

  // Стабильные id/slug/sku приходят из productRegistry.json (см. scripts/importPrice.js).
  // Fallback на хеш используется только для legacy-данных без id (бэкап для разработки).
  const fallbackId = createStableId(`${title}|${category}|${unit}`);
  const id = Number.isFinite(rawProduct.id) ? rawProduct.id : fallbackId;
  const slugBase = slugify(title || mark);
  const fallbackSlug = slugBase
    ? `${slugBase}-${id.toString(36)}`
    : `product-${id.toString(36)}`;
  const slug =
    typeof rawProduct.slug === 'string' && rawProduct.slug
      ? rawProduct.slug
      : fallbackSlug;
  const sku =
    typeof rawProduct.sku === 'string' && rawProduct.sku
      ? rawProduct.sku
      : `YU-${String(id).padStart(7, '0').slice(-7)}`;
  const name = normalizeText(rawProduct.name || title);
  const image =
    imageOverrides[name] ||
    imageOverrides[title] ||
    findImageByMatcher(rawProduct) ||
    CATEGORY_IMAGES[catalogPlacement.categorySlug] ||
    PLACEHOLDER_IMAGE;

  return {
    id,
    slug,
    sku,
    title,
    fullName: title,
    name,
    mark,
    markFamily: normalizeText(rawProduct.markFamily || ''),
    category,
    price,
    unit,
    stock,
    shortDescription: buildShortDescription(rawProduct),
    description: buildDescription(rawProduct, category, unit, stock),
    image,
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
