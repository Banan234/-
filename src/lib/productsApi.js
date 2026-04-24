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
  if (options.category) {
    params.set('category', options.category);
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

export async function fetchProductBySlug(slug, signal) {
  const result = await fetchJson(
    `/api/products/${slug}`,
    signal,
    'Не удалось загрузить товар'
  );

  return result.item;
}
