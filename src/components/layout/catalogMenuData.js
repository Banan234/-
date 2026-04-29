import catalogCategoriesData from '../../../shared/catalogCategories.json';

const cableSection = catalogCategoriesData.sections.find(
  (section) => section.slug === 'kabel-i-provod'
);

function buildSearchLink(term) {
  return {
    label: term,
    to: `/catalog?search=${encodeURIComponent(term)}`,
  };
}

function buildCategoryMenuItem(category) {
  const uniqueKeywords = Array.from(new Set(category.keywords || []))
    .filter(Boolean)
    .slice(0, 5);

  return {
    title: category.name,
    slug: category.slug,
    links: [
      { label: category.name, to: `/catalog/${category.slug}` },
      ...uniqueKeywords.map(buildSearchLink),
    ],
  };
}

export const CABLE_SECTION_NAME = cableSection?.name || 'Кабель и провод';

export const CATALOG_MENU = [
  ...(cableSection?.categories || []).map(buildCategoryMenuItem),
  {
    title: 'Некабельная продукция',
    slug: 'nekabelnaya-produkciya',
    links: [
      { label: 'Некабельная продукция', to: '/catalog/nekabelnaya-produkciya' },
    ],
  },
];
