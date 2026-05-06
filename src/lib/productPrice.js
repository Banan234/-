const PRICE_FALLBACKS = Object.freeze({
  request: 'Цена по запросу',
  quote: 'Цена будет рассчитана в КП',
});

function getPriceFallback(options = {}) {
  if (typeof options.fallback === 'string' && options.fallback.trim()) {
    return options.fallback;
  }

  if (options.context === 'quote') {
    return PRICE_FALLBACKS.quote;
  }

  return PRICE_FALLBACKS.request;
}

export function formatProductPrice(price, unit, options = {}) {
  const fallback = getPriceFallback(options);
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
