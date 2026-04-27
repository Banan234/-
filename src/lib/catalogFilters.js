// Источник правды о флекс-марках/материале/жилах — lib/catalogClassifiers.js.
// Здесь только фронт-специфичная обёртка над getConductorMaterial: на list-items
// поле cableDecoded обрезано, поэтому сначала пробуем явные флаги isAluminum
// и conductorMaterial, и только потом падаем в общий классификатор.
import {
  getConductorMaterial as getConductorMaterialFromDecoded,
  getCoreVariantLabel,
  getWireConstruction,
} from '../../lib/catalogClassifiers.js';

export { getCoreVariantLabel, getWireConstruction };

export function formatVoltage(v) {
  return v % 1 === 0 ? String(v) : String(v).replace('.', ',');
}

export function getConductorMaterial(product) {
  if (product?.isAluminum) {
    return 'алюминий';
  }

  if (product?.conductorMaterial) {
    return product.conductorMaterial;
  }

  return getConductorMaterialFromDecoded(product);
}
