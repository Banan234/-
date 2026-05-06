// Файл готовит клиентские фильтры каталога, фасеты и признаки товаров для UI выдачи.

import {
  getConductorMaterial,
  getCoreVariantLabel,
  getWireConstruction,
} from '../../lib/catalogClassifiers.js';

export { getConductorMaterial, getCoreVariantLabel, getWireConstruction };

export function formatVoltage(v) {
  return v % 1 === 0 ? String(v) : String(v).replace('.', ',');
}
