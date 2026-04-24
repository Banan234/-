const FLEXIBLE_MARK_RE = /^(КГ|ПуГ|ПВС|ШВВП|КОГ|ПРГ|ПМГ)/i;

export function getWireConstruction(product) {
  const mark = product?.mark || '';
  return FLEXIBLE_MARK_RE.test(mark) ? 'многопроволочная' : 'однопроволочная';
}

export function formatVoltage(v) {
  return v % 1 === 0 ? String(v) : String(v).replace('.', ',');
}

export function getConductorMaterial(product) {
  const decoded = product?.cableDecoded?.decoded;
  if (!decoded) return 'медь';
  const isAluminum = decoded.some((d) => d.includes('алюминиевые жилы'));
  return isAluminum ? 'алюминий' : 'медь';
}

export function getCoreVariantLabel(product) {
  const cores = normalizePositiveNumber(product?.cores);
  const groundCores = normalizePositiveNumber(product?.groundCores);

  if (!cores) {
    return '';
  }

  return groundCores ? `${cores}+${groundCores}` : String(cores);
}

function normalizePositiveNumber(value) {
  const normalized = Number(value);

  if (!Number.isFinite(normalized) || normalized <= 0) {
    return null;
  }

  return normalized;
}
