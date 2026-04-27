const UNIT_ALIASES = ['км', 'м', 'шт', 'штука', 'бухта', 'упак', 'упаковка'];

// Торговые марки заводов-производителей, предшествующие обозначению кабеля через дефис
const MANUFACTURER_PREFIXES = new Set([
  // Российские производители
  'ПИРОКОР',
  'КИВИ',
  'ГЕРДА',
  'СОББИТ',
  'МЕТРОЛАН',
  'ТРАНСКАБ',
  'ЛОУТОКС',
  'КРУИНВЭЛК',
  'КРУИН',
  'АРМОФЛЕКС',
  'КУПТЕКС',
  'VIKAB',
  'ВИКАБ',
  // Иностранные производители
  'LAPPKABEL',
  'HELUKABEL',
  'BELDEN',
  'HOLDCAB',
  'PRYSMIAN',
  'SIEMENS',
]);

const FAMILY_CATEGORY_ALIASES = {
  NYM: 'Кабель NYY, NUM',
  NYY: 'Кабель NYY, NUM',
  NUM: 'Кабель NYY, NUM',
  АВВГ: 'Кабель АВВГ',
  ВВГ: 'Кабель ВВГ',
  АКВВГ: 'Кабель АКВВГ',
  КВВГ: 'Кабель КВВГ',
  КГ: 'Кабель КГ',
};

export function createEmptyImportResult() {
  return {
    products: [],
    skippedRows: [],
  };
}

export function normalizeImportedProduct(product) {
  const fullName = normalizeText(product.name);
  const parsedName = parseProductName(fullName);
  const normalizedName = buildNormalizedProductName(fullName, parsedName);
  const normalizedUnit = normalizeUnit(product.unit);
  const normalizedPrice = normalizeNumber(product.price);
  const normalizedStock = normalizeNumber(product.stock);
  const inferredUnit = inferMissingUnit({
    unit: normalizedUnit,
    price: normalizedPrice,
    stock: normalizedStock,
    parsedName,
  });
  const normalizedCommercial = normalizeCommercialFields({
    unit: inferredUnit,
    price: normalizedPrice,
    stock: normalizedStock,
  });

  return {
    name: normalizedName,
    fullName: normalizedName,
    mark: parsedName.mark,
    markFamily: parsedName.markFamily,
    manufacturer: parsedName.manufacturer,
    cores: parsedName.cores,
    crossSection: parsedName.crossSection,
    hasGroundCore: parsedName.hasGroundCore,
    groundCores: parsedName.groundCores,
    groundSection: parsedName.groundSection,
    voltage: parsedName.voltage,
    attributes: parsedName.attributes,
    unit: normalizedCommercial.unit,
    price: normalizedCommercial.price,
    stock: normalizedCommercial.stock,
    sourceCategory: normalizeCategory(
      product.sourceCategory || product.category
    ),
    category: normalizeCategory(product.category),
  };
}

export function parseCombinedCell(value) {
  const source = String(value || '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!source) {
    return null;
  }

  // Требуем, чтобы строка ЗАКАНЧИВАЛАСЬ на (опциональная единица) + цена + остаток.
  // Иначе это не строка товара, а заголовок раздела (напр. «Провод медный ПВ1,ПВ3,...»)
  const tailPattern = new RegExp(
    `\\s+((?:${UNIT_ALIASES.join('|')}))?\\s*(\\d[\\d\\s.,]*)\\s+(\\d[\\d\\s.,]*)$`,
    'i'
  );
  const tailMatch = source.match(tailPattern);

  if (!tailMatch) {
    return null;
  }

  const unit = (tailMatch[1] || '').trim().toLowerCase();
  const price = normalizeNumber(tailMatch[2]);
  const stock = normalizeNumber(tailMatch[3]);
  const name = source.slice(0, tailMatch.index).trim();

  if (!name) {
    return null;
  }

  return {
    name,
    unit,
    price,
    stock,
  };
}

function normalizeUnit(unit) {
  const value = normalizeText(unit).toLowerCase();

  if (!value) {
    return '';
  }

  if (value === 'штука') {
    return 'шт';
  }

  if (value === 'упаковка') {
    return 'упак';
  }

  return value;
}

// Если единица измерения в прайсе отсутствует, но позиция выглядит как кабель
// (есть спецификация жил/сечения), цена высокая, а остаток дробный — это
// почти наверняка километры. Такое встречается у КМТВэВ и других «редких»
// марок, где поставщик не заполнил колонку «ед. изм.».
function inferMissingUnit({ unit, price, stock, parsedName }) {
  if (unit) {
    return unit;
  }

  const looksLikeCable = Boolean(parsedName?.cores && parsedName?.crossSection);
  if (!looksLikeCable) {
    return unit;
  }

  // Цена > 5000 за «штуку» для кабеля с сечением и дробный остаток (< 10)
  // — надёжный признак, что цена указана за км, а остаток в км.
  const fractionalStock = stock > 0 && stock < 10;
  if (price >= 5000 && fractionalStock) {
    return 'км';
  }

  return unit;
}

function normalizeCommercialFields({ unit, price, stock }) {
  if (unit !== 'км') {
    return { unit, price, stock };
  }

  return {
    unit: 'м',
    price: roundTo(price / 1000, 3),
    stock: roundTo(stock * 1000, 3),
  };
}

function stripManufacturerPrefix(value) {
  const match = value.match(/^([А-ЯЁA-Z]{4,})[-\s](.+)$/i);
  if (!match) return { name: value, manufacturer: null };
  const upper = match[1].toUpperCase();
  if (MANUFACTURER_PREFIXES.has(upper)) {
    return { name: match[2].trim(), manufacturer: upper };
  }
  return { name: value, manufacturer: null };
}

export function parseProductName(value) {
  const { name: stripped, manufacturer } = stripManufacturerPrefix(
    normalizeText(value)
  );
  const source = stripped;

  if (!source) {
    return createEmptyNameParts();
  }

  const voltageMatch = source.match(/(\d+(?:[.,]\d+)?)\s*[кkК]\s*[вvВV]/);
  const specPattern =
    /(\d+)\s*[xх×]\s*(\d+(?:[.,]\d+)?)(?:\s*\+\s*(\d+)\s*[xх×]\s*(\d+(?:[.,]\d+)?))?/i;
  const specMatch = source.match(specPattern);

  let mark = source;
  let markFamily = source;
  let cores = null;
  let crossSection = null;
  let groundCores = null;
  let groundSection = null;
  let attributes = [];
  let isImplicitSingleCore = false;

  if (specMatch) {
    const specIndex = specMatch.index ?? source.length;
    mark = source.slice(0, specIndex).trim();
    // Если перед спецификацией нет марки (напр. "SIEMENS 1Х2Х0.32" после
    // отсечения префикса-производителя), используем производителя как марку.
    if (!mark && manufacturer) {
      mark = manufacturer;
    }
    markFamily = normalizeMarkFamily(mark);
    cores = Number(specMatch[1]);
    crossSection = normalizeNumber(specMatch[2]);
    groundCores = specMatch[3] ? Number(specMatch[3]) : null;
    groundSection = specMatch[4] ? normalizeNumber(specMatch[4]) : null;

    const tail = normalizeText(source.slice(specIndex + specMatch[0].length));
    attributes = splitAttributes(tail).filter(
      (token) => !/^(\d+(?:[.,]\d+)?)\s*[кkК]\s*[вvВV]$/.test(token)
    );
  } else {
    const plainSectionMatch = source.match(
      /^(.*?)(\d+(?:[.,]\d+)?)(?:\s+([^\d].*))?$/
    );

    if (plainSectionMatch && isLikelySingleCoreSection(plainSectionMatch[2])) {
      mark = normalizeText(plainSectionMatch[1]);
      markFamily = normalizeMarkFamily(mark);
      cores = 1;
      crossSection = normalizeNumber(plainSectionMatch[2]);
      attributes = splitAttributes(plainSectionMatch[3] || '');
      isImplicitSingleCore = true;
    } else {
      mark = source;
      markFamily = normalizeMarkFamily(mark);
    }
  }

  return {
    mark,
    markFamily,
    manufacturer,
    cores,
    crossSection,
    hasGroundCore: Boolean(groundCores && groundSection),
    groundCores,
    groundSection,
    voltage: voltageMatch ? normalizeNumber(voltageMatch[1]) : null,
    attributes,
    isImplicitSingleCore,
  };
}

export function resolveCategory(product, categoryByFamily = new Map()) {
  const sourceCategory = normalizeCategory(product.sourceCategory);
  const family = normalizeMarkFamily(
    product.markFamily || product.mark || product.name
  );
  const displayFamily = normalizeText(
    product.mark || product.markFamily || product.name
  );

  if (
    isSpecificSourceCategory(sourceCategory) &&
    isCategoryCompatible(sourceCategory, family)
  ) {
    return sourceCategory;
  }

  if (family && categoryByFamily.has(family)) {
    return categoryByFamily.get(family);
  }

  if (family) {
    return (
      FAMILY_CATEGORY_ALIASES[family] || `Кабель ${displayFamily || family}`
    );
  }

  if (isSpecificSourceCategory(sourceCategory)) {
    return sourceCategory;
  }

  return 'Без категории';
}

export function buildCategoryMap(products) {
  const counts = new Map();

  for (const product of products) {
    const sourceCategory = normalizeCategory(product.sourceCategory);
    const family = normalizeMarkFamily(
      product.markFamily || product.mark || product.name
    );

    if (!family || !isSpecificSourceCategory(sourceCategory)) {
      continue;
    }

    if (!isCategoryCompatible(sourceCategory, family)) {
      continue;
    }

    if (!counts.has(family)) {
      counts.set(family, new Map());
    }

    const familyCounts = counts.get(family);
    familyCounts.set(
      sourceCategory,
      (familyCounts.get(sourceCategory) || 0) + 1
    );
  }

  const resolved = new Map();

  for (const [family, familyCounts] of counts.entries()) {
    const bestCategory = [...familyCounts.entries()].sort(
      (a, b) => b[1] - a[1]
    )[0]?.[0];
    if (bestCategory) {
      resolved.set(family, bestCategory);
    }
  }

  return resolved;
}

function normalizeNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  const raw = String(value || '')
    .replace(/\s+/g, '')
    .trim();

  if (!raw) {
    return 0;
  }

  let normalized = raw;

  if (normalized.includes(',') && normalized.includes('.')) {
    normalized = normalized.replace(/,/g, '');
  } else if (normalized.includes(',')) {
    const parts = normalized.split(',');

    if (parts.length === 2 && parts[1].length !== 3) {
      normalized = `${parts[0]}.${parts[1]}`;
    } else {
      normalized = parts.join('');
    }
  }

  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : 0;
}

function roundTo(value, precision) {
  const factor = 10 ** precision;

  return Math.round(value * factor) / factor;
}

function normalizeText(value) {
  return (
    String(value || '')
      .replace(/\s+/g, ' ')
      // Унифицируем оператор умножения в размерах (3x2.5, 3×2.5, 3 х 2.5 → 3х2.5).
      // Важно: заменяем только между цифрами, чтобы не ломать латинские буквы
      // в суффиксах вроде «LTx», «нг(А)-LS-LTx».
      .replace(/(\d)\s*[×xXхХ]\s*(\d)/g, '$1х$2')
      .trim()
  );
}

function normalizeCategory(value) {
  const category = normalizeText(value);

  return category || 'Без категории';
}

function normalizeMarkFamily(value) {
  return normalizeText(value)
    .replace(/^[^A-Za-zА-Яа-я0-9]+/g, '')
    .replace(/\s+/g, '')
    .replace(/[.,;:+]+$/g, '')
    .toUpperCase();
}

function createEmptyNameParts() {
  return {
    mark: '',
    markFamily: '',
    manufacturer: null,
    cores: null,
    crossSection: null,
    hasGroundCore: false,
    groundCores: null,
    groundSection: null,
    voltage: null,
    attributes: [],
    isImplicitSingleCore: false,
  };
}

function buildNormalizedProductName(source, parsedName) {
  if (
    !parsedName.isImplicitSingleCore ||
    !parsedName.mark ||
    !parsedName.crossSection
  ) {
    return source;
  }

  const suffix = parsedName.attributes.length
    ? ` ${parsedName.attributes.join(' ')}`
    : '';

  return `${parsedName.mark} 1х${formatSectionValue(parsedName.crossSection)}${suffix}`;
}

function formatSectionValue(value) {
  return Number(value).toLocaleString('en-US', {
    maximumFractionDigits: 3,
    useGrouping: false,
  });
}

function splitAttributes(value) {
  const normalized = normalizeText(value).replace(/^\-+/, '').trim();

  if (!normalized) {
    return [];
  }

  return normalized
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .map(normalizeNgModification);
}

// нгLS → нг-LS, нг(А)LSLtx → нг(А)-LS-LTx, нгхл → нг-ХЛ
function normalizeNgModification(token) {
  const match = token.match(/^нг(\([^)]*\))?-?(.*)$/i);
  if (!match) return token;

  const cls = match[1] || '';
  const suffix = match[2] || '';
  if (!suffix) return `нг${cls}`;

  return `нг${cls}-${normalizeNgSuffix(suffix)}`;
}

const NG_SUFFIX_TOKENS = [
  [/^FRLS/i, 'FRLS'],
  [/^LS/i, 'LS'],
  [/^FRHF/i, 'FRHF'],
  [/^HF/i, 'HF'],
  [/^LTx/i, 'LTx'],
  [/^хк\([^)]*\)вэ/i, 'ХК(LX)ВЭ'],
  [/^хл/i, 'ХЛ'],
  [/^нд/i, 'НД'],
];

function normalizeNgSuffix(suffix) {
  const parts = [];
  let rest = suffix;

  while (rest) {
    if (rest[0] === '-') {
      rest = rest.slice(1);
      continue;
    }

    let matched = false;
    for (const [pattern, normalized] of NG_SUFFIX_TOKENS) {
      const m = rest.match(pattern);
      if (m) {
        parts.push(normalized);
        rest = rest.slice(m[0].length);
        matched = true;
        break;
      }
    }

    if (!matched) {
      parts.push(rest);
      break;
    }
  }

  return parts.join('-');
}

function isLikelySingleCoreSection(value) {
  const normalized = normalizeNumber(value);

  if (!normalized) {
    return false;
  }

  // Filters out article-like numeric tails while keeping realistic cable sections.
  return normalized > 0 && normalized <= 1000;
}

function isSpecificSourceCategory(value) {
  const category = normalizeCategory(value);

  if (!category || category === 'Без категории') {
    return false;
  }

  if (category === 'К А Б Е Л Ь Н А Я П Р О Д У К Ц И Я') {
    return false;
  }

  return true;
}

function isCategoryCompatible(category, family) {
  const categoryKey = toComparisonKey(category);
  const familyKey = toComparisonKey(family);

  if (!familyKey) {
    return false;
  }

  if (categoryKey.includes(familyKey)) {
    return true;
  }

  const aliasCategory = FAMILY_CATEGORY_ALIASES[family];

  if (aliasCategory && toComparisonKey(aliasCategory) === categoryKey) {
    return true;
  }

  if (family === 'NYM' && categoryKey.includes('NUM')) {
    return true;
  }

  return false;
}

function toComparisonKey(value) {
  return normalizeText(value)
    .toUpperCase()
    .replace(/[Ё]/g, 'Е')
    .replace(/[.,;:()\-\/+\s]/g, '')
    .replace(/[АA]/g, 'A')
    .replace(/[ВB]/g, 'B')
    .replace(/[ЕE]/g, 'E')
    .replace(/[КK]/g, 'K')
    .replace(/[МM]/g, 'M')
    .replace(/[НH]/g, 'H')
    .replace(/[ОO]/g, 'O')
    .replace(/[РP]/g, 'P')
    .replace(/[СC]/g, 'C')
    .replace(/[ТT]/g, 'T')
    .replace(/[УY]/g, 'Y')
    .replace(/[ХX]/g, 'X');
}
