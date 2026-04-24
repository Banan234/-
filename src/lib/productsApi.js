async function fetchJson(url, signal, fallbackMessage) {
  const response = await fetch(url, { signal });
  const result = await response.json();

  if (!response.ok || !result.ok) {
    throw new Error(result.message || fallbackMessage);
  }

  return result;
}

export function fetchProducts(signal) {
  return fetchJson('/api/products', signal, 'Не удалось загрузить каталог');
}

export async function fetchProductBySlug(slug, signal) {
  const result = await fetchJson(
    `/api/products/${slug}`,
    signal,
    'Не удалось загрузить товар'
  );

  return result.item;
}
