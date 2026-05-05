export function formatProductPrice(price, unit, options = {}) {
  const fallback = options.fallback || 'Цена по запросу';
  const positivePrice = Number(price);

  if (!Number.isFinite(positivePrice) || positivePrice <= 0) {
    return {
      value: fallback,
      unitLabel: '',
      text: fallback,
      hasPrice: false,
    };
  }

  const value = `${positivePrice.toLocaleString('ru-RU')} ₽`;
  const unitLabel = unit ? `/ ${unit}` : '';

  return {
    value,
    unitLabel,
    text: unitLabel ? `${value} ${unitLabel}` : value,
    hasPrice: true,
  };
}
