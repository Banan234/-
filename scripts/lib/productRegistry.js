import fs from 'fs/promises';

const TRANSLIT = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh',
  з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o',
  п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts',
  ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
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
    ? [...product.attributes].map((a) => String(a).toLowerCase().trim()).sort().join(',')
    : '';
  const parts = [
    String(product.mark || '').toLowerCase().trim(),
    product.cores ?? '',
    product.crossSection ?? '',
    product.voltage ?? '',
    product.groundCores ?? '',
    product.groundSection ?? '',
    String(product.manufacturer || '').toLowerCase().trim(),
    attrs,
  ];
  return parts.join('|');
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

export function assignStableIdentity(registry, product, now = new Date().toISOString()) {
  const stableKey = buildStableKey(product);
  let entry = registry.entries[stableKey];

  if (!entry) {
    const id = registry.nextId;
    registry.nextId += 1;
    const slugBase = slugify(product.fullName || product.name || product.mark || 'product');
    const slug = slugBase
      ? `${slugBase}-${id.toString(36)}`
      : `product-${id.toString(36)}`;
    const sku = `YU-${String(id).padStart(7, '0').slice(-7)}`;
    entry = { id, slug, sku, firstSeen: now, lastSeen: now };
    registry.entries[stableKey] = entry;
  } else {
    entry.lastSeen = now;
  }

  return { id: entry.id, slug: entry.slug, sku: entry.sku, stableKey };
}
