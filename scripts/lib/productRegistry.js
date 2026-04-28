import fs from 'fs/promises';

const TRANSLIT = {
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

function transliterate(value) {
  return [...String(value || '')]
    .map((ch) => TRANSLIT[ch.toLowerCase()] ?? ch)
    .join('');
}

function slugify(value) {
  return transliterate(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function buildStableKey(product) {
  const attrs = Array.isArray(product.attributes)
    ? [...product.attributes]
        .map((a) => String(a).toLowerCase().trim())
        .sort()
        .join(',')
    : '';
  const parts = [
    String(product.mark || '')
      .toLowerCase()
      .trim(),
    product.cores ?? '',
    product.crossSection ?? '',
    product.voltage ?? '',
    product.groundCores ?? '',
    product.groundSection ?? '',
    String(product.manufacturer || '')
      .toLowerCase()
      .trim(),
    attrs,
  ];
  return parts.join('|');
}

// Спек-ключ — stableKey без первой компоненты (mark). Используется для
// детекции переименований: если у позиции в импорте новый mark, но все
// остальные характеристики совпадают с осиротевшей записью реестра — это
// та же позиция, переименованная поставщиком.
export function specKeyFromStableKey(stableKey) {
  const idx = String(stableKey).indexOf('|');
  return idx === -1 ? '' : stableKey.slice(idx);
}

export function buildSpecKey(product) {
  return specKeyFromStableKey(buildStableKey(product));
}

function buildSlug(product, id) {
  const slugBase = slugify(
    product.fullName || product.name || product.mark || 'product'
  );
  return slugBase
    ? `${slugBase}-${id.toString(36)}`
    : `product-${id.toString(36)}`;
}

export async function loadProductRegistry(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    return {
      version: parsed.version || 1,
      nextId: parsed.nextId || 1,
      entries: parsed.entries || {},
    };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { version: 1, nextId: 1, entries: {} };
    }
    throw error;
  }
}

export async function saveProductRegistry(filePath, registry) {
  const sortedEntries = Object.fromEntries(
    Object.entries(registry.entries).sort(([, a], [, b]) => a.id - b.id)
  );
  const payload = {
    version: registry.version,
    nextId: registry.nextId,
    entries: sortedEntries,
  };
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf-8');
}

// Индекс осиротевших записей по spec-ключу. «Осиротевшая» — та, чей
// stableKey не встречается в текущем импорте. Кандидат на переименование.
// При совпадении запись из индекса убирается, чтобы не приклеить её
// сразу к двум новым позициям.
export function buildOrphanSpecIndex(registry, currentStableKeys) {
  const index = new Map();
  for (const stableKey of Object.keys(registry.entries)) {
    if (currentStableKeys.has(stableKey)) continue;
    const specKey = specKeyFromStableKey(stableKey);
    if (!specKey) continue;
    if (!index.has(specKey)) index.set(specKey, []);
    index.get(specKey).push(stableKey);
  }
  return index;
}

export function assignStableIdentity(
  registry,
  product,
  now = new Date().toISOString(),
  options = {}
) {
  const stableKey = buildStableKey(product);
  let entry = registry.entries[stableKey];

  if (entry) {
    entry.lastSeen = now;
    return { id: entry.id, slug: entry.slug, sku: entry.sku, stableKey };
  }

  const orphanIndex = options.orphanIndex;
  if (orphanIndex) {
    const specKey = specKeyFromStableKey(stableKey);
    const candidates = orphanIndex.get(specKey);
    if (candidates && candidates.length > 0) {
      const oldStableKey = candidates.shift();
      if (candidates.length === 0) orphanIndex.delete(specKey);
      const oldEntry = registry.entries[oldStableKey];
      delete registry.entries[oldStableKey];
      const newSlug = buildSlug(product, oldEntry.id);
      const slugHistory = Array.isArray(oldEntry.slugHistory)
        ? [...oldEntry.slugHistory]
        : [];
      if (oldEntry.slug && oldEntry.slug !== newSlug) {
        slugHistory.push(oldEntry.slug);
      }
      // Удаляем дубли и сам текущий slug, если он успел оказаться в истории.
      const dedupedHistory = [...new Set(slugHistory)].filter(
        (s) => s && s !== newSlug
      );
      entry = {
        ...oldEntry,
        slug: newSlug,
        slugHistory: dedupedHistory,
        lastSeen: now,
      };
      registry.entries[stableKey] = entry;
      return { id: entry.id, slug: entry.slug, sku: entry.sku, stableKey };
    }
  }

  const id = registry.nextId;
  registry.nextId += 1;
  const slug = buildSlug(product, id);
  const sku = `YU-${String(id).padStart(7, '0').slice(-7)}`;
  entry = { id, slug, sku, firstSeen: now, lastSeen: now };
  registry.entries[stableKey] = entry;
  return { id: entry.id, slug: entry.slug, sku: entry.sku, stableKey };
}

// Возвращает map старый-slug → актуальный-slug для всех переименований,
// зафиксированных в реестре. Используется для генерации 301-редиректов.
export function buildSlugRedirects(registry) {
  const redirects = {};
  for (const entry of Object.values(registry.entries)) {
    const history = Array.isArray(entry.slugHistory) ? entry.slugHistory : [];
    for (const oldSlug of history) {
      if (oldSlug && oldSlug !== entry.slug) {
        redirects[oldSlug] = entry.slug;
      }
    }
  }
  return redirects;
}
