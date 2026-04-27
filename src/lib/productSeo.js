// SEO-логика для карточки товара. Используется и в React (ProductPage),
// и в build-time prerender (scripts/prerender.js) — поэтому никаких импортов
// из react/react-router здесь быть не должно.

import {
  SITE_LEGAL_NAME,
  SITE_NAME,
  SITE_URL,
  absoluteUrl,
} from './siteConfig.js';
import { normalizeMetaDescription } from './metaDescription.js';

export function buildProductJsonLd(product) {
  if (!product) return null;

  const url = absoluteUrl(`/product/${product.slug}`);
  const price = Number(product.price);
  const hasPrice = Number.isFinite(price) && price > 0;
  const stock = Number(product.stock);
  const hasStock = Number.isFinite(stock) && stock > 0;
  const brandName =
    product.catalogBrand || product.manufacturer || SITE_LEGAL_NAME;

  const data = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.title || product.fullName || product.name,
    sku: product.sku || String(product.id),
    url,
    description:
      product.description ||
      [
        product.fullName || product.name,
        product.catalogCategory,
        product.catalogSection,
      ]
        .filter(Boolean)
        .join(' · '),
    brand: {
      '@type': 'Brand',
      name: brandName,
    },
    category: product.catalogCategory || product.catalogSection || undefined,
  };

  if (product.image) {
    data.image = absoluteUrl(product.image);
  }

  if (product.mark) {
    data.mpn = product.mark;
  }

  if (hasPrice) {
    data.offers = {
      '@type': 'Offer',
      url,
      priceCurrency: 'RUB',
      price: price.toFixed(2),
      availability: hasStock
        ? 'https://schema.org/InStock'
        : 'https://schema.org/PreOrder',
      itemCondition: 'https://schema.org/NewCondition',
      seller: {
        '@type': 'Organization',
        name: SITE_NAME,
        url: SITE_URL,
      },
    };
  }

  return data;
}

function getCatalogPath(slug) {
  return slug ? `/catalog/${slug}` : '/catalog';
}

export function getProductBreadcrumbs(product) {
  const items = [
    { label: 'Главная', to: '/' },
    { label: 'Каталог', to: '/catalog' },
  ];
  const hasSection = Boolean(product.catalogSection);
  const hasCategory = Boolean(product.catalogCategory);
  const isSameCatalogLevel =
    (product.catalogSectionSlug &&
      product.catalogSectionSlug === product.catalogCategorySlug) ||
    product.catalogSection === product.catalogCategory;

  if (hasSection) {
    items.push({
      label: product.catalogSection,
      to: getCatalogPath(product.catalogSectionSlug),
    });
  }

  if (hasCategory && !isSameCatalogLevel) {
    items.push({
      label: product.catalogCategory,
      to: getCatalogPath(product.catalogCategorySlug),
    });
  }

  items.push({
    label:
      product.title ||
      product.fullName ||
      product.name ||
      product.mark ||
      'Карточка товара',
    to: `/product/${product.slug}`,
    isCurrent: true,
  });

  return items;
}

export function buildProductBreadcrumbJsonLd(product) {
  if (!product) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: getProductBreadcrumbs(product).map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.label,
      item: absoluteUrl(item.to),
    })),
  };
}

export function buildProductMetaDescription(product) {
  if (!product) return '';
  return normalizeMetaDescription(
    product.description ||
      [
        product.fullName || product.title,
        product.catalogCategory,
        'купить оптом в Челябинске со склада',
      ]
        .filter(Boolean)
        .join('. ')
  );
}
