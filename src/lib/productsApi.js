async function fetchJson(url, signal, fallbackMessage) {
  const response = await fetch(url, { signal });
  const result = await response.json();

  if (!response.ok || !result.ok) {
    throw new Error(result.message || fallbackMessage);
  }

  return result;
}

export function fetchProducts(signal, options = {}) {
  const params = new URLSearchParams();
  for (const key of [
    'category',
    'search',
    'priceMin',
    'priceMax',
    'material',
    'construction',
    'cores',
    'section',
    'voltage',
    'appType',
    'spe',
    'sort',
    'page',
    'limit',
  ]) {
    if (
      options[key] !== undefined &&
      options[key] !== null &&
      options[key] !== ''
    ) {
      params.set(key, String(options[key]));
    }
  }
  const query = params.toString();
  const url = query ? `/api/products?${query}` : '/api/products';
  return fetchJson(url, signal, 'Не удалось загрузить каталог');
}

export async function fetchFeaturedProducts(limit, signal) {
  const result = await fetchJson(
    `/api/products/featured?limit=${limit}`,
    signal,
    'Не удалось загрузить позиции'
  );

  return result.items;
}

export async function fetchRelatedProducts(slug, limit, signal) {
  const result = await fetchJson(
    `/api/products/${slug}/related?limit=${limit}`,
    signal,
    'Не удалось загрузить похожие товары'
  );

  return result.items;
}

export async function fetchProductSuggestions(search, limit, signal) {
  const params = new URLSearchParams();
  params.set('search', search);
  params.set('limit', String(limit));
  const result = await fetchJson(
    `/api/products/suggestions?${params.toString()}`,
    signal,
    'Не удалось загрузить подсказки'
  );

  return result.items;
}

export async function fetchProductBySlug(slug, signal) {
  const result = await fetchJson(
    `/api/products/${slug}`,
    signal,
    'Не удалось загрузить товар'
  );

  return result.item;
}
