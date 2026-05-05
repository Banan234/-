import {
  getConductorMaterial,
  getCoreVariantLabel,
  getWireConstruction,
} from '../lib/catalogClassifiers.js';

export function buildCatalogFacetsCore(items) {
  const materialSet = new Set();
  const constructionSet = new Set();
  const coreSet = new Set();
  const sectionSet = new Set();
  const voltageSet = new Set();
  const appTypeSet = new Set();
  let hasSPE = false;
  let minPrice = Infinity;
  let maxPrice = -Infinity;

  for (const product of items) {
    materialSet.add(getConductorMaterial(product));
    constructionSet.add(getWireConstruction(product));

    const coreVariant = getCoreVariantLabel(product);
    if (coreVariant) coreSet.add(coreVariant);
    if (product.crossSection) sectionSet.add(product.crossSection);
    if (product.voltage != null) voltageSet.add(product.voltage);
    if (product.catalogApplicationType)
      appTypeSet.add(product.catalogApplicationType);
    if (product.catalogType === 'СПЭ') hasSPE = true;

    const price = Number(product.price);
    if (Number.isFinite(price) && price > 0) {
      if (price < minPrice) minPrice = price;
      if (price > maxPrice) maxPrice = price;
    }
  }

  return {
    materials: [...materialSet].sort((a, b) => a.localeCompare(b, 'ru')),
    constructions: [...constructionSet].sort((a, b) =>
      a.localeCompare(b, 'ru')
    ),
    cores: [...coreSet].sort((a, b) =>
      a.localeCompare(b, 'ru', { numeric: true })
    ),
    sections: [...sectionSet].sort((a, b) => a - b),
    voltages: [...voltageSet].sort((a, b) => a - b),
    appTypes: [...appTypeSet].sort((a, b) => a.localeCompare(b, 'ru')),
    hasSPE,
    minPrice: Number.isFinite(minPrice) ? minPrice : 0,
    maxPrice: Number.isFinite(maxPrice) ? maxPrice : 0,
  };
}

export function applyProductFiltersCore(items, query) {
  let result = items;
  const selectedMaterials = query.selectedMaterials || [];
  const selectedConstructions = query.selectedConstructions || [];
  const selectedCores = query.selectedCores || [];
  const selectedSections = query.selectedSections || [];
  const selectedVoltages = query.selectedVoltages || [];
  const selectedAppTypes = query.selectedAppTypes || [];
  const priceMinNumber = query.priceMinNumber;
  const priceMaxNumber = query.priceMaxNumber;

  if (selectedMaterials.length > 0) {
    result = result.filter((item) =>
      selectedMaterials.includes(getConductorMaterial(item))
    );
  }
  if (selectedConstructions.length > 0) {
    result = result.filter((item) =>
      selectedConstructions.includes(getWireConstruction(item))
    );
  }
  if (selectedCores.length > 0) {
    result = result.filter((item) =>
      selectedCores.includes(getCoreVariantLabel(item))
    );
  }
  if (selectedSections.length > 0) {
    result = result.filter((item) =>
      selectedSections.includes(item.crossSection)
    );
  }
  if (selectedVoltages.length > 0) {
    result = result.filter((item) => selectedVoltages.includes(item.voltage));
  }
  if (selectedAppTypes.length > 0) {
    result = result.filter((item) =>
      selectedAppTypes.includes(item.catalogApplicationType)
    );
  }
  if (query.onlySPE) {
    result = result.filter((item) => item.catalogType === 'СПЭ');
  }
  if (Number.isFinite(priceMinNumber) && priceMinNumber > 0) {
    result = result.filter((item) => Number(item.price) >= priceMinNumber);
  }
  if (Number.isFinite(priceMaxNumber) && priceMaxNumber > 0) {
    result = result.filter((item) => Number(item.price) <= priceMaxNumber);
  }

  return result;
}

function comparePrices(a, b, sortPrice, direction) {
  const priceA = sortPrice(a);
  const priceB = sortPrice(b);
  if (priceA === null && priceB === null) return 0;
  if (priceA === null) return 1;
  if (priceB === null) return -1;
  return direction === 1 ? priceA - priceB : priceB - priceA;
}

export function sortProductsCore(items, sortBy) {
  if (!sortBy || sortBy === 'default') return items;

  const result = [...items];
  const sortPrice = (product) => {
    const value = Number(product.price);
    return Number.isFinite(value) && value > 0 ? value : null;
  };

  if (sortBy === 'price-asc') {
    result.sort((a, b) => comparePrices(a, b, sortPrice, 1));
  } else if (sortBy === 'price-desc') {
    result.sort((a, b) => comparePrices(a, b, sortPrice, -1));
  } else if (sortBy === 'title-asc') {
    result.sort((a, b) => a.title.localeCompare(b.title, 'ru'));
  } else if (sortBy === 'popular') {
    result.sort((a, b) => (b.stock || 0) - (a.stock || 0));
  }

  return result;
}
