import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import {
  buildCategoryMap,
  createEmptyImportResult,
  normalizeImportedProduct,
  parseCombinedCell,
  resolveCategory,
} from './lib/priceParser.js';
import { classifyProduct, decodeCable } from './lib/catalogClassifier.js';
import {
  assignStableIdentity,
  loadProductRegistry,
  saveProductRegistry,
} from './lib/productRegistry.js';
import { writeSeoArtifacts } from './lib/siteSeo.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const cliArgs = process.argv.slice(2);
const cliFlags = new Set(cliArgs.filter((arg) => arg.startsWith('--')));
const positionalArgs = cliArgs.filter((arg) => !arg.startsWith('--'));
const isDryRun = cliFlags.has('--dry-run');

const URL_RE = /^https?:\/\//i;
const positionalSource = positionalArgs[0] || '';
// Источник прайса: явный URL/путь в argv → переменная окружения PRICE_URL → дефолтный data/price.xls.
// URL автоматически скачивается перед парсингом.
const priceUrl = URL_RE.test(positionalSource)
  ? positionalSource
  : process.env.PRICE_URL || '';
const inputFile =
  (priceUrl ? '' : positionalSource) ||
  path.join(projectRoot, 'data', 'price.xls');
const outputFile = path.join(projectRoot, 'data', 'products.json');
const reportFile = path.join(projectRoot, 'data', 'import-report.json');
const reportHtmlFile = path.join(projectRoot, 'data', 'import-report.html');
const overridesFile = path.join(projectRoot, 'data', 'priceOverrides.json');
const importConfigFile = path.join(projectRoot, 'data', 'importConfig.json');
const registryFile = path.join(projectRoot, 'data', 'productRegistry.json');
const publicDir = path.join(projectRoot, 'public');
const catalogCategoriesFile = path.join(
  projectRoot,
  'data',
  'catalogCategories.json'
);

const REQUIRED_HEADER_TOKENS = ['наименование', 'ед.изм', 'цена', 'остаток'];

const DEFAULT_IMPORT_CONFIG = {
  suspiciousPriceThresholds: {},
  suspiciousPriceStats: {
    historyFile: 'data/import-history.json',
    historyLimit: 8,
    minimumSamples: 30,
    thresholdPercentile: 0.99,
    thresholdMultiplier: 3,
  },
  classificationReport: {
    productLimit: 500,
    topPrefixLimit: 20,
  },
};

let priceOverrides = null;
let priceMatchers = null;
async function loadPriceOverrides() {
  if (priceOverrides) return priceOverrides;
  try {
    const raw = await fs.readFile(overridesFile, 'utf-8');
    const parsed = JSON.parse(raw);
    priceOverrides = parsed?.overrides || {};
    priceMatchers = Array.isArray(parsed?.matchers) ? parsed.matchers : [];
  } catch {
    priceOverrides = {};
    priceMatchers = [];
  }
  return priceOverrides;
}

function normalizeMarkKey(value) {
  return String(value || '')
    .replace(/\s+/g, '')
    .toLowerCase();
}

function findMatcherOverride(product) {
  if (!Array.isArray(priceMatchers) || priceMatchers.length === 0) return null;
  const productMark = normalizeMarkKey(product.mark);
  if (!productMark) return null;
  return (
    priceMatchers.find((matcher) => {
      if (!matcher || typeof matcher !== 'object') return false;
      if (normalizeMarkKey(matcher.mark) !== productMark) return false;
      if (
        matcher.cores != null &&
        Number(matcher.cores) !== Number(product.cores)
      ) {
        return false;
      }
      if (
        matcher.crossSection != null &&
        Number(matcher.crossSection) !== Number(product.crossSection)
      ) {
        return false;
      }
      if (
        matcher.voltage != null &&
        Number(matcher.voltage) !== Number(product.voltage)
      ) {
        return false;
      }
      return true;
    }) || null
  );
}

function applyPriceOverride(product) {
  if (!priceOverrides) return product;
  const override =
    priceOverrides[product.name] ||
    priceOverrides[product.fullName] ||
    findMatcherOverride(product);
  if (!override) return product;
  let newPrice = product.price;
  if (typeof override.price === 'number') {
    newPrice = override.price;
  } else if (
    typeof override.priceDivide === 'number' &&
    override.priceDivide > 0
  ) {
    newPrice = product.price / override.priceDivide;
  } else if (
    typeof override.priceMultiply === 'number' &&
    override.priceMultiply > 0
  ) {
    newPrice = product.price * override.priceMultiply;
  }
  return { ...product, price: Math.round(newPrice * 1000) / 1000 };
}

async function loadImportConfig() {
  try {
    const raw = await fs.readFile(importConfigFile, 'utf-8');
    const parsed = JSON.parse(raw);

    return mergeImportConfig(parsed);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn('Не удалось прочитать importConfig.json:', error.message);
    }

    return mergeImportConfig({});
  }
}

function mergeImportConfig(config) {
  return {
    suspiciousPriceThresholds: {
      ...DEFAULT_IMPORT_CONFIG.suspiciousPriceThresholds,
      ...(config.suspiciousPriceThresholds || {}),
    },
    suspiciousPriceStats: {
      ...DEFAULT_IMPORT_CONFIG.suspiciousPriceStats,
      ...(config.suspiciousPriceStats || {}),
    },
    classificationReport: {
      ...DEFAULT_IMPORT_CONFIG.classificationReport,
      ...(config.classificationReport || {}),
    },
  };
}

function resolveProjectPath(value) {
  if (!value) {
    return projectRoot;
  }

  return path.isAbsolute(value) ? value : path.join(projectRoot, value);
}

function getImportHistoryFile(config) {
  return resolveProjectPath(config.suspiciousPriceStats.historyFile);
}
const PAGE_COLUMNS = {
  left: [0, 1, 2, 3],
  right: [5, 6, 7, 8],
};

async function loadWorkbookRows() {
  try {
    const workbookBuffer = await fs.readFile(inputFile);
    const xlsx = await import('xlsx');
    const workbook = xlsx.read(workbookBuffer, {
      type: 'buffer',
      cellDates: false,
    });
    const firstSheetName = workbook.SheetNames[0];

    if (!firstSheetName) {
      throw new Error('В Excel-файле нет листов');
    }

    const worksheet = workbook.Sheets[firstSheetName];

    return xlsx.utils.sheet_to_json(worksheet, {
      header: 1,
      blankrows: false,
      defval: '',
      raw: false,
    });
  } catch (error) {
    if (error.code === 'ERR_MODULE_NOT_FOUND') {
      throw new Error('Пакет "xlsx" не установлен. Выполни: npm install xlsx');
    }

    throw error;
  }
}

function detectSchema(rows) {
  const headerRowIndexes = [];
  const detectedHeaders = new Set();

  rows.forEach((row, index) => {
    if (!isHeaderRow(row)) return;
    headerRowIndexes.push(index);
    for (const cell of row) {
      const value = String(cell ?? '')
        .trim()
        .toLowerCase();
      if (!value) continue;
      for (const token of REQUIRED_HEADER_TOKENS) {
        if (value.includes(token)) {
          detectedHeaders.add(token);
        }
      }
    }
  });

  const missingHeaders = REQUIRED_HEADER_TOKENS.filter(
    (token) => !detectedHeaders.has(token)
  );

  return {
    headerRowsFound: headerRowIndexes.length,
    detectedHeaders: [...detectedHeaders].sort(),
    missingHeaders,
    pageColumns: PAGE_COLUMNS,
    pagePattern:
      'left=cols[0,1,2,3] / right=cols[5,6,7,8]; чтение «по книге»: верх→правый,левый; низ→левый,правый',
  };
}

function extractProducts(rows) {
  const result = createEmptyImportResult();
  result.totalRows = rows.length;
  result.categoriesSeen = new Set();

  const orderedPages = buildBookReadingOrder(splitRowsIntoBlocks(rows));

  for (const page of orderedPages) {
    let currentCategory = 'Без категории';

    for (const item of page.rows) {
      const { row, rowIndex } = item;
      const pageCells = pickPageCells(row, page.side);
      const record = parsePageRow(pageCells, row, currentCategory, rowIndex);

      if (!record) {
        continue;
      }

      if (record.type === 'category') {
        currentCategory = record.value;
        result.categoriesSeen.add(currentCategory);
        continue;
      }

      if (record.type === 'skip') {
        result.skippedRows.push(record.value);
        continue;
      }

      result.products.push(record.value);
    }
  }

  return result;
}

function splitRowsIntoBlocks(rows) {
  const headerIndexes = [];

  rows.forEach((row, index) => {
    if (isHeaderRow(row)) {
      headerIndexes.push(index);
    }
  });

  return headerIndexes.map((startIndex, blockIndex) => {
    const endIndex = headerIndexes[blockIndex + 1] ?? rows.length;
    const blockRows = [];
    for (let i = startIndex + 1; i < endIndex; i += 1) {
      blockRows.push({ row: rows[i], rowIndex: i });
    }

    return {
      index: blockIndex,
      rows: blockRows,
    };
  });
}

function buildBookReadingOrder(blocks) {
  const orderedPages = [];

  for (let index = 0; index < blocks.length; index += 2) {
    const topBlock = blocks[index];
    const bottomBlock = blocks[index + 1];

    if (topBlock) {
      orderedPages.push({
        blockIndex: topBlock.index,
        side: 'right',
        rows: topBlock.rows,
      });
      orderedPages.push({
        blockIndex: topBlock.index,
        side: 'left',
        rows: topBlock.rows,
      });
    }

    if (bottomBlock) {
      orderedPages.push({
        blockIndex: bottomBlock.index,
        side: 'left',
        rows: bottomBlock.rows,
      });
      orderedPages.push({
        blockIndex: bottomBlock.index,
        side: 'right',
        rows: bottomBlock.rows,
      });
    }
  }

  return orderedPages;
}

function pickPageCells(row, side) {
  const indexes = PAGE_COLUMNS[side];

  return indexes.map((columnIndex) => String(row?.[columnIndex] ?? '').trim());
}

function parsePageRow(cells, sourceRow, category, rowIndex = null) {
  const filledCells = cells.filter(Boolean);

  if (filledCells.length === 0) {
    return null;
  }

  if (isHeaderRow(cells) || isServiceRow(cells)) {
    return null;
  }

  if (filledCells.length === 1) {
    const singleValue = filledCells[0];

    const parsed = parseCombinedCell(singleValue);

    if (parsed) {
      return createProductRecord(parsed, category, sourceRow, rowIndex);
    }

    if (looksLikeCategoryHeading(singleValue)) {
      return {
        type: 'category',
        value: singleValue,
      };
    }

    return {
      type: 'skip',
      value: {
        rowIndex,
        row: sourceRow,
        category,
        reason: 'Не удалось распарсить строку из одной ячейки',
      },
    };
  }

  return createProductRecord(
    {
      name: cells[0],
      unit: cells[1] || '',
      price: cells[2] || 0,
      stock: cells[3] || 0,
    },
    category,
    sourceRow,
    rowIndex
  );
}

function createProductRecord(
  product,
  category,
  sourceRow = null,
  rowIndex = null
) {
  const normalized = applyPriceOverride(
    normalizeImportedProduct({
      ...product,
      category,
    })
  );

  if (!normalized.name) {
    return {
      type: 'skip',
      value: {
        rowIndex,
        row: sourceRow,
        category,
        reason: 'Пустое наименование после нормализации',
      },
    };
  }

  if (
    normalized.price <= 0 &&
    normalized.stock <= 0 &&
    isCategoryRow(normalized.name)
  ) {
    return {
      type: 'category',
      value: normalized.name,
    };
  }

  if (normalized.stock <= 0) {
    return {
      type: 'skip',
      value: {
        rowIndex,
        row: sourceRow,
        category,
        reason: 'Нулевой или отрицательный остаток',
        product: normalized.name,
        price: normalized.price,
        stock: normalized.stock,
      },
    };
  }

  if (normalized.price <= 0) {
    return {
      type: 'skip',
      value: {
        rowIndex,
        row: sourceRow,
        category,
        reason: 'Отсутствует цена',
        product: normalized.name,
        stock: normalized.stock,
      },
    };
  }

  return {
    type: 'product',
    value: normalized,
  };
}

function isHeaderRow(cells) {
  const joined = cells
    .map((cell) => String(cell ?? ''))
    .join(' ')
    .toLowerCase();

  return (
    joined.includes('наименование') ||
    joined.includes('ед.изм') ||
    (joined.includes('цена') && joined.includes('остаток'))
  );
}

function isCategoryRow(value) {
  const normalized = value.trim();

  if (!normalized) {
    return false;
  }

  if (/\d/.test(normalized)) {
    return false;
  }

  return normalized.length > 2;
}

// Эвристика для подзаголовков внутри страницы, когда parseCombinedCell
// не смог распознать товар. Разрешаем цифры (например, «Кабель КВПЭфВП-5е»),
// но отсекаем мусор: слишком короткое, без букв, одни числа.
function looksLikeCategoryHeading(value) {
  const normalized = String(value || '').trim();

  if (normalized.length < 3) {
    return false;
  }

  const hasLetters = /[A-Za-zА-Яа-яЁё]/.test(normalized);
  if (!hasLetters) {
    return false;
  }

  // Отфильтровываем строки-хвосты прайса (ИНН, телефон и т.п.)
  if (isServiceRow([normalized])) {
    return false;
  }

  return true;
}

function isServiceRow(cells) {
  const joined = cells.join(' ').toLowerCase();

  return (
    joined.includes('ооо') ||
    joined.includes('инн') ||
    joined.includes('адрес') ||
    joined.includes('телефон') ||
    joined.includes('e-mail') ||
    joined.includes('р/с') ||
    joined.includes('к/с') ||
    joined.includes('прайс-лист') ||
    joined.includes('цены действительны')
  );
}

async function saveProducts(products) {
  await fs.mkdir(path.dirname(outputFile), { recursive: true });
  await fs.writeFile(outputFile, JSON.stringify(products, null, 2), 'utf-8');
}

async function loadPreviousProducts() {
  try {
    const raw = await fs.readFile(outputFile, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    console.warn(
      'Не удалось прочитать предыдущий products.json:',
      error.message
    );
    return [];
  }
}

function productKey(product) {
  return String(product?.fullName || product?.name || '')
    .trim()
    .toLowerCase();
}

function buildDiff(previous, current) {
  const prevMap = new Map();
  for (const product of previous) {
    const key = productKey(product);
    if (key) prevMap.set(key, product);
  }

  const currMap = new Map();
  for (const product of current) {
    const key = productKey(product);
    if (key) currMap.set(key, product);
  }

  const added = [];
  const removed = [];
  const priceChanged = [];
  const priceAlerts = [];
  const stockChanged = [];
  const categoryChanged = [];

  for (const [key, product] of currMap) {
    const prev = prevMap.get(key);
    if (!prev) {
      added.push({
        name: product.name,
        category: product.category,
        price: product.price,
        stock: product.stock,
      });
      continue;
    }

    if (Number(prev.price) !== Number(product.price)) {
      const deltaPercent = prev.price
        ? Number((((product.price - prev.price) / prev.price) * 100).toFixed(2))
        : null;

      const entry = {
        name: product.name,
        category: product.category,
        priceBefore: prev.price,
        priceAfter: product.price,
        deltaPercent,
      };

      priceChanged.push(entry);

      if (
        deltaPercent !== null &&
        Math.abs(deltaPercent) >= PRICE_JUMP_ALERT_PERCENT
      ) {
        priceAlerts.push(entry);
      }
    }

    if (Number(prev.stock) !== Number(product.stock)) {
      stockChanged.push({
        name: product.name,
        category: product.category,
        stockBefore: prev.stock,
        stockAfter: product.stock,
      });
    }

    if ((prev.category || '') !== (product.category || '')) {
      categoryChanged.push({
        name: product.name,
        categoryBefore: prev.category || '',
        categoryAfter: product.category || '',
      });
    }
  }

  for (const [key, product] of prevMap) {
    if (!currMap.has(key)) {
      removed.push({
        name: product.name,
        category: product.category,
        price: product.price,
        stock: product.stock,
      });
    }
  }

  // Сортируем алерты по убыванию модуля изменения
  priceAlerts.sort(
    (a, b) => Math.abs(b.deltaPercent) - Math.abs(a.deltaPercent)
  );

  return {
    added,
    removed,
    priceChanged,
    priceAlerts,
    stockChanged,
    categoryChanged,
  };
}

const PRICE_JUMP_ALERT_PERCENT = 50;

async function loadImportHistory(config) {
  const historyFile = getImportHistoryFile(config);

  try {
    const raw = await fs.readFile(historyFile, 'utf-8');
    const parsed = JSON.parse(raw);
    return normalizeImportHistory(parsed);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn('Не удалось прочитать историю импортов:', error.message);
    }

    return normalizeImportHistory({});
  }
}

function normalizeImportHistory(history) {
  return {
    version: 1,
    imports: Array.isArray(history.imports)
      ? history.imports.filter((entry) => entry && typeof entry === 'object')
      : [],
  };
}

function buildHistorySnapshot(products, { generatedAt, sourceFile }) {
  const unitPrices = {};

  for (const product of products) {
    const unit = String(product.unit || '').trim();
    const price = Number(product.price);

    if (!unit || !Number.isFinite(price) || price <= 0) {
      continue;
    }

    if (!unitPrices[unit]) {
      unitPrices[unit] = [];
    }

    unitPrices[unit].push(Math.round(price * 1000) / 1000);
  }

  for (const prices of Object.values(unitPrices)) {
    prices.sort((a, b) => a - b);
  }

  return {
    generatedAt,
    sourceFile,
    productsImported: products.length,
    unitPrices,
  };
}

function getHistoricalSnapshots(history, previousProducts, sourceFile) {
  if (history.imports.length > 0) {
    return history.imports;
  }

  if (previousProducts.length === 0) {
    return [];
  }

  return [
    buildHistorySnapshot(previousProducts, {
      generatedAt: null,
      sourceFile,
    }),
  ];
}

async function saveImportHistory(config, history, snapshot) {
  const historyFile = getImportHistoryFile(config);
  const historyLimit = Math.max(
    1,
    Number(config.suspiciousPriceStats.historyLimit) || 1
  );
  const nextHistory = {
    version: 1,
    generatedAt: new Date().toISOString(),
    imports: [...history.imports, snapshot].slice(-historyLimit),
  };

  await fs.mkdir(path.dirname(historyFile), { recursive: true });
  await fs.writeFile(
    historyFile,
    JSON.stringify(nextHistory, null, 2),
    'utf-8'
  );

  return nextHistory;
}

function buildSuspiciousPriceStats(config, historySnapshots) {
  const statsConfig = config.suspiciousPriceStats;
  const configuredThresholds = config.suspiciousPriceThresholds;
  const pricesByUnit = new Map();
  const maxImportSamplesByUnit = new Map();

  for (const snapshot of historySnapshots) {
    const unitPrices = snapshot.unitPrices || {};
    for (const [unit, prices] of Object.entries(unitPrices)) {
      if (!Array.isArray(prices)) {
        continue;
      }

      if (!pricesByUnit.has(unit)) {
        pricesByUnit.set(unit, []);
      }

      const target = pricesByUnit.get(unit);
      let validPricesInImport = 0;
      for (const price of prices) {
        const value = Number(price);
        if (Number.isFinite(value) && value > 0) {
          target.push(value);
          validPricesInImport += 1;
        }
      }

      maxImportSamplesByUnit.set(
        unit,
        Math.max(maxImportSamplesByUnit.get(unit) || 0, validPricesInImport)
      );
    }
  }

  const units = new Set([
    ...Object.keys(configuredThresholds),
    ...pricesByUnit.keys(),
  ]);
  const byUnit = {};
  const minimumSamples = Number(statsConfig.minimumSamples) || 0;
  const thresholdPercentile = Number(statsConfig.thresholdPercentile) || 0.99;
  const thresholdMultiplier = Number(statsConfig.thresholdMultiplier) || 1;

  for (const unit of [...units].sort()) {
    const prices = pricesByUnit.get(unit) || [];
    prices.sort((a, b) => a - b);

    const p95 = roundNullable(percentile(prices, 0.95), 3);
    const p99 = roundNullable(percentile(prices, 0.99), 3);
    const configuredFallback = toPositiveNumber(configuredThresholds[unit]);
    const thresholdBase = percentile(prices, thresholdPercentile);
    const maxImportSamples = maxImportSamplesByUnit.get(unit) || 0;
    const hasEnoughHistory =
      maxImportSamples >= minimumSamples && Number.isFinite(thresholdBase);
    const threshold = hasEnoughHistory
      ? roundNullable(thresholdBase * thresholdMultiplier, 3)
      : configuredFallback;

    byUnit[unit] = {
      count: prices.length,
      maxImportSamples,
      p95,
      p99,
      threshold,
      source: hasEnoughHistory ? 'history' : 'config',
      thresholdPercentile,
      thresholdMultiplier,
      configuredFallback,
    };
  }

  return {
    historyImports: historySnapshots.length,
    historyFile: path.relative(projectRoot, getImportHistoryFile(config)),
    minimumSamples,
    thresholdPercentile,
    thresholdMultiplier,
    byUnit,
  };
}

function percentile(sortedValues, percentileValue) {
  if (!Array.isArray(sortedValues) || sortedValues.length === 0) {
    return null;
  }

  const p = Math.min(1, Math.max(0, Number(percentileValue)));
  const index = (sortedValues.length - 1) * p;
  const lowerIndex = Math.floor(index);
  const upperIndex = Math.ceil(index);

  if (lowerIndex === upperIndex) {
    return sortedValues[lowerIndex];
  }

  const lower = sortedValues[lowerIndex];
  const upper = sortedValues[upperIndex];
  return lower + (upper - lower) * (index - lowerIndex);
}

function roundNullable(value, digits = 3) {
  if (!Number.isFinite(value)) {
    return null;
  }

  const multiplier = 10 ** digits;
  return Math.round(value * multiplier) / multiplier;
}

function toPositiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function detectSuspicious(products, priceStats) {
  const issues = [];

  for (const product of products) {
    const reasons = [];

    if (!product.unit) {
      reasons.push('Не определена единица измерения');
    }

    if (product.price <= 0) {
      reasons.push('Отсутствует цена');
    }

    const unitStats = priceStats.byUnit?.[product.unit];
    const threshold = unitStats?.threshold;
    if (threshold && product.price > threshold) {
      reasons.push(
        `Цена ${product.price} ₽ за «${product.unit}» превышает порог ${threshold} (${formatThresholdSource(unitStats)})`
      );
    }

    if (product.price >= 1_000_000 && product.price % 100_000 === 0) {
      reasons.push('Подозрительно круглая сумма (возможна ошибка ввода)');
    }

    if (reasons.length > 0) {
      issues.push({
        name: product.name,
        category: product.category,
        unit: product.unit,
        price: product.price,
        stock: product.stock,
        reasons,
      });
    }
  }

  return issues;
}

function formatThresholdSource(unitStats) {
  if (unitStats.source === 'history') {
    const percentileLabel = Math.round(unitStats.thresholdPercentile * 100);
    return `p${percentileLabel} × ${unitStats.thresholdMultiplier} по истории`;
  }

  return 'importConfig.json';
}

function summarizeSkips(skippedRows) {
  const byReason = new Map();
  for (const row of skippedRows) {
    const reason = row.reason || 'Без причины';
    byReason.set(reason, (byReason.get(reason) || 0) + 1);
  }
  return Object.fromEntries(byReason);
}

function summarizeByCategory(products) {
  const counts = new Map();
  for (const product of products) {
    const key = product.category || 'Без категории';
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort((a, b) => b[1] - a[1]));
}

function buildClassificationReport(products, config) {
  const reportConfig = config.classificationReport;
  const topPrefixLimit = Math.max(1, Number(reportConfig.topPrefixLimit) || 20);
  const productLimit = Math.max(1, Number(reportConfig.productLimit) || 500);
  const fallbackProducts = products.filter(isFallbackToOther);
  const prefixMap = new Map();

  for (const product of fallbackProducts) {
    const prefix = extractUnrecognizedPrefix(product);
    if (!prefixMap.has(prefix)) {
      prefixMap.set(prefix, {
        prefix,
        count: 0,
        examples: [],
      });
    }

    const entry = prefixMap.get(prefix);
    entry.count += 1;

    if (entry.examples.length < 5) {
      entry.examples.push({
        name: product.name,
        markFamily: product.markFamily || '',
        sourceCategory: product.sourceCategory || '',
      });
    }
  }

  const topPrefixes = [...prefixMap.values()]
    .sort((a, b) => b.count - a.count || a.prefix.localeCompare(b.prefix, 'ru'))
    .slice(0, topPrefixLimit);

  return {
    fallbackToOther: {
      count: fallbackProducts.length,
      productLimit,
      topPrefixLimit,
      truncated: Math.max(0, fallbackProducts.length - productLimit),
      topPrefixes,
      products: fallbackProducts.slice(0, productLimit).map((product) => ({
        name: product.name,
        mark: product.mark || '',
        markFamily: product.markFamily || '',
        sourceCategory: product.sourceCategory || '',
        unit: product.unit,
        price: product.price,
        stock: product.stock,
        prefix: extractUnrecognizedPrefix(product),
      })),
    },
  };
}

function stripClassificationDiagnostics(product) {
  const {
    catalogClassificationSource,
    catalogClassificationMatch,
    ...publicProduct
  } = product;

  return publicProduct;
}

function isFallbackToOther(product) {
  return (
    product.catalogClassificationSource === 'fallback' &&
    product.catalogCategorySlug === 'prochee'
  );
}

function extractUnrecognizedPrefix(product) {
  const source = String(
    product.markFamily || product.mark || product.name || ''
  ).trim();

  if (!source) {
    return 'Без марки';
  }

  const manufacturer = String(product.manufacturer || '').trim();
  const withoutManufacturer =
    manufacturer && source.toLowerCase().startsWith(manufacturer.toLowerCase())
      ? source.slice(manufacturer.length).replace(/^[-\s]+/, '')
      : source;
  const compact = withoutManufacturer.replace(/\s+/g, ' ').trim();
  const withoutSpec = compact
    .replace(/\s+\d+\s*[xх×].*$/i, '')
    .replace(/\s+\d+(?:[.,]\d+)?\s*[кkК]\s*[вvВV].*$/i, '')
    .trim();
  const tokenMatch = withoutSpec.match(
    /^[A-Za-zА-Яа-яЁё0-9]+(?:[-/][A-Za-zА-Яа-яЁё0-9]+)?/
  );
  const token = (tokenMatch?.[0] || withoutSpec.split(/\s+/)[0] || compact)
    .replace(/[.,;:()]+$/g, '')
    .trim();

  return token || 'Без марки';
}

async function saveReport(report) {
  await fs.mkdir(path.dirname(reportFile), { recursive: true });
  await fs.writeFile(reportFile, JSON.stringify(report, null, 2), 'utf-8');
}

async function saveHtmlReport(report) {
  await fs.mkdir(path.dirname(reportHtmlFile), { recursive: true });
  await fs.writeFile(reportHtmlFile, buildReportHtml(report), 'utf-8');
}

const numberFormatter = new Intl.NumberFormat('ru-RU', {
  maximumFractionDigits: 3,
});

const reportDateFormatter = new Intl.DateTimeFormat('ru-RU', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

function escapeHtml(value) {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (char) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[char]
  );
}

function formatNumber(value) {
  if (value === null || value === undefined || value === '') {
    return '—';
  }

  const number = Number(value);
  if (!Number.isFinite(number)) {
    return escapeHtml(value);
  }

  return numberFormatter.format(number);
}

function formatMoney(value) {
  if (value === null || value === undefined || value === '') {
    return '—';
  }

  return `${formatNumber(value)} ₽`;
}

function formatPercent(value) {
  if (value === null || value === undefined || value === '') {
    return '—';
  }

  const number = Number(value);
  if (!Number.isFinite(number)) {
    return escapeHtml(value);
  }

  return `${number > 0 ? '+' : ''}${numberFormatter.format(number)}%`;
}

function formatReportDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return escapeHtml(value);
  }

  return reportDateFormatter.format(date);
}

function deltaClass(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number === 0) {
    return '';
  }

  return number > 0 ? 'positive' : 'negative';
}

function renderTable(rows, columns, emptyMessage, rowClass = null) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return `<div class="empty-state">${escapeHtml(emptyMessage)}</div>`;
  }

  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>${columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join('')}</tr>
        </thead>
        <tbody>
          ${rows
            .map((row) => {
              const className = rowClass ? rowClass(row) : '';
              const classAttribute = className
                ? ` class="${escapeHtml(className)}"`
                : '';

              return `
                <tr${classAttribute}>
                  ${columns
                    .map((column) => {
                      const value = column.render
                        ? column.render(row)
                        : escapeHtml(row[column.key]);

                      return `<td data-label="${escapeHtml(column.label)}">${value}</td>`;
                    })
                    .join('')}
                </tr>
              `;
            })
            .join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderReasons(reasons) {
  if (!Array.isArray(reasons) || reasons.length === 0) {
    return '—';
  }

  return reasons.map((reason) => escapeHtml(reason)).join('<br>');
}

function renderExamples(examples) {
  if (!Array.isArray(examples) || examples.length === 0) {
    return '—';
  }

  return examples
    .slice(0, 3)
    .map((example) => escapeHtml(example.name))
    .join('<br>');
}

function renderReportTabs(report, alertPercent) {
  const diff = report.diff || {};
  const summary = report.summary || {};
  const fallbackToOther = report.classification?.fallbackToOther || {};
  const priceRows = [...(diff.priceChanged || [])].sort(
    (a, b) =>
      Math.abs(Number(b.deltaPercent) || 0) -
      Math.abs(Number(a.deltaPercent) || 0)
  );
  const priceAlertRows = (
    diff.priceAlerts?.length
      ? [...diff.priceAlerts]
      : priceRows.filter(
          (row) => Math.abs(Number(row.deltaPercent) || 0) >= alertPercent
        )
  ).sort(
    (a, b) =>
      Math.abs(Number(b.deltaPercent) || 0) -
      Math.abs(Number(a.deltaPercent) || 0)
  );

  const productColumns = [
    { key: 'name', label: 'Наименование' },
    { key: 'category', label: 'Категория' },
    { label: 'Цена', render: (row) => formatMoney(row.price) },
    { label: 'Остаток', render: (row) => formatNumber(row.stock) },
  ];
  const priceColumns = [
    { key: 'name', label: 'Наименование' },
    { key: 'category', label: 'Категория' },
    { label: 'Было', render: (row) => formatMoney(row.priceBefore) },
    { label: 'Стало', render: (row) => formatMoney(row.priceAfter) },
    {
      label: 'Изменение',
      render: (row) =>
        `<span class="delta ${deltaClass(row.deltaPercent)}">${formatPercent(row.deltaPercent)}</span>`,
    },
  ];
  const tabs = [
    {
      id: 'added',
      label: 'Добавлено',
      count: summary.added ?? diff.added?.length ?? 0,
      content: renderTable(diff.added, productColumns, 'Новых позиций нет.'),
    },
    {
      id: 'removed',
      label: 'Удалено',
      count: summary.removed ?? diff.removed?.length ?? 0,
      content: renderTable(
        diff.removed,
        productColumns,
        'Удалённых позиций нет.'
      ),
    },
    {
      id: 'prices',
      label: `Цены ±${alertPercent}%`,
      count: summary.priceAlerts ?? priceAlertRows.length,
      content: `
        <p class="panel-note">
          Порог резкого изменения: ${formatNumber(alertPercent)}%.
          Всего изменённых цен: ${formatNumber(summary.priceChanged ?? priceRows.length)}.
        </p>
        ${renderTable(priceAlertRows, priceColumns, `Изменений цен на ±${alertPercent}% и больше нет.`)}
        ${
          priceRows.length > priceAlertRows.length
            ? `<details class="details-block">
                <summary>Все изменения цен (${formatNumber(priceRows.length)})</summary>
                ${renderTable(priceRows, priceColumns, 'Изменённых цен нет.')}
              </details>`
            : ''
        }
      `,
    },
    {
      id: 'suspicious',
      label: 'Подозрительные',
      count: summary.suspicious ?? report.suspicious?.length ?? 0,
      content: renderTable(
        report.suspicious,
        [
          { key: 'name', label: 'Наименование' },
          { key: 'category', label: 'Категория' },
          { key: 'unit', label: 'Ед.' },
          { label: 'Цена', render: (row) => formatMoney(row.price) },
          { label: 'Остаток', render: (row) => formatNumber(row.stock) },
          { label: 'Причина', render: (row) => renderReasons(row.reasons) },
        ],
        'Подозрительных цен нет.'
      ),
    },
    {
      id: 'categories',
      label: 'Смена категорий',
      count: summary.categoryChanged ?? diff.categoryChanged?.length ?? 0,
      content: renderTable(
        diff.categoryChanged,
        [
          { key: 'name', label: 'Наименование' },
          { key: 'categoryBefore', label: 'Было' },
          { key: 'categoryAfter', label: 'Стало' },
        ],
        'Смен категорий нет.'
      ),
    },
    {
      id: 'unclassified',
      label: 'Прочее',
      count: fallbackToOther.count ?? 0,
      content: `
        <p class="panel-note">
          Позиции, которые не подошли ни под одно правило и ушли в fallback «Прочее».
          ${
            fallbackToOther.truncated
              ? `Показаны первые ${formatNumber(fallbackToOther.productLimit)}, скрыто ${formatNumber(fallbackToOther.truncated)}.`
              : ''
          }
        </p>
        <h2>Частые нераспознанные префиксы</h2>
        ${renderTable(
          fallbackToOther.topPrefixes,
          [
            { key: 'prefix', label: 'Префикс' },
            { label: 'Позиций', render: (row) => formatNumber(row.count) },
            { label: 'Примеры', render: (row) => renderExamples(row.examples) },
          ],
          'Нераспознанных префиксов нет.'
        )}
        <h2 class="section-subtitle">Позиции в fallback</h2>
        ${renderTable(
          fallbackToOther.products,
          [
            { key: 'name', label: 'Наименование' },
            { key: 'prefix', label: 'Префикс' },
            { key: 'markFamily', label: 'Марка' },
            { key: 'sourceCategory', label: 'Исходная категория' },
            { key: 'unit', label: 'Ед.' },
            { label: 'Цена', render: (row) => formatMoney(row.price) },
            { label: 'Остаток', render: (row) => formatNumber(row.stock) },
          ],
          'Позиции в fallback «Прочее» не найдены.'
        )}
      `,
    },
  ];

  return `
    <div class="tabs" role="tablist">
      ${tabs
        .map(
          (tab, index) => `
            <button class="tab-button${index === 0 ? ' active' : ''}" type="button" data-tab="${tab.id}">
              <span>${escapeHtml(tab.label)}</span>
              <strong>${formatNumber(tab.count)}</strong>
            </button>
          `
        )
        .join('')}
    </div>
    <div class="panels">
      ${tabs
        .map(
          (tab, index) => `
            <section class="tab-panel${index === 0 ? ' active' : ''}" data-panel="${tab.id}">
              ${tab.content}
            </section>
          `
        )
        .join('')}
    </div>
  `;
}

function renderStockChanges(report) {
  const rows = report.diff?.stockChanged || [];

  return `
    <details class="details-block">
      <summary>Изменения остатков (${formatNumber(rows.length)})</summary>
      ${renderTable(
        rows,
        [
          { key: 'name', label: 'Наименование' },
          { key: 'category', label: 'Категория' },
          { label: 'Было', render: (row) => formatNumber(row.stockBefore) },
          { label: 'Стало', render: (row) => formatNumber(row.stockAfter) },
        ],
        'Изменений остатков нет.'
      )}
    </details>
  `;
}

function renderSuspiciousPriceStats(report) {
  const rows = Object.entries(report.suspiciousPriceStats?.byUnit || {}).map(
    ([unit, stats]) => ({
      unit,
      ...stats,
    })
  );

  return renderTable(
    rows,
    [
      { key: 'unit', label: 'Ед.' },
      { label: 'Цен в истории', render: (row) => formatNumber(row.count) },
      {
        label: 'Макс. в импорте',
        render: (row) => formatNumber(row.maxImportSamples),
      },
      { label: 'p95', render: (row) => formatMoney(row.p95) },
      { label: 'p99', render: (row) => formatMoney(row.p99) },
      { label: 'Порог', render: (row) => formatMoney(row.threshold) },
      {
        label: 'Источник',
        render: (row) =>
          row.source === 'history'
            ? `История (${formatThresholdSource(row)})`
            : 'importConfig.json',
      },
    ],
    'Статистика цен пока не накоплена.'
  );
}

function buildReportHtml(report) {
  const summary = report.summary || {};
  const alertPercent = Number(
    report.priceAlertPercent || PRICE_JUMP_ALERT_PERCENT
  );
  const sourceFileName = path.basename(report.sourceFile || inputFile);
  const categoryRows = Object.entries(report.productsByCategory || {}).map(
    ([category, count]) => ({ category, count })
  );
  const skipRows = Object.entries(report.skipsByReason || {}).map(
    ([reason, count]) => ({
      reason,
      count,
    })
  );
  const skippedRows = Array.isArray(report.skippedRows)
    ? report.skippedRows
    : [];
  const statCards = [
    ['Импортировано', summary.productsImported],
    ['Было ранее', summary.productsPrevious],
    ['Категорий найдено', summary.categoriesDetected],
    ['Строк пропущено', summary.skippedRows],
    ['Изменений цен', summary.priceChanged],
    ['Изменений остатков', summary.stockChanged],
    ['Прочее fallback', summary.fallbackToOther],
  ];

  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Отчёт импорта прайса</title>
  <style>
    :root {
      --bg: #f4f7fb;
      --paper: #fbfdff;
      --ink: #0a1628;
      --muted: #5a6f87;
      --line: #d7e3ef;
      --accent: linear-gradient(180deg, #ffd35a 0%, #f2b705 100%);
      font-family: Inter, Arial, sans-serif;
    }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--bg); color: var(--ink); }
    main { max-width: 1240px; margin: 0 auto; padding: 34px 22px 48px; }
    .hero, .panel, .stat {
      background: var(--paper);
      border: 1px solid #e2eaf4;
      border-radius: 24px;
      box-shadow: 0 14px 34px rgba(17, 53, 95, 0.06);
    }
    .hero { padding: 28px; margin-bottom: 18px; }
    .eyebrow {
      display: inline-flex; margin-bottom: 12px; padding: 7px 12px;
      border-radius: 999px; border: 1px solid #cad8e5; background: #e8f0f7;
      color: #35556d; font-size: 13px; font-weight: 800; text-transform: uppercase;
    }
    h1 { margin: 0 0 10px; font-size: clamp(30px, 4vw, 46px); line-height: 1.04; font-weight: 900; }
    .meta { margin: 0; color: var(--muted); line-height: 1.6; }
    .stats { display: grid; grid-template-columns: repeat(6, 1fr); gap: 12px; margin: 18px 0; }
    .stat { padding: 18px; }
    .stat span { display: block; color: var(--muted); font-size: 13px; font-weight: 700; }
      .stat strong { display: block; margin-top: 8px; font-size: 26px; line-height: 1; }
      .panel { padding: 18px; margin-top: 18px; }
      .section-subtitle { margin-top: 22px; }
    .tabs { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 16px; }
    .tab-button {
      display: inline-flex; gap: 9px; align-items: center; border: 1px solid var(--line);
      border-radius: 999px; padding: 10px 14px; background: #fff; color: #102238;
      font: inherit; font-weight: 800; cursor: pointer;
    }
    .tab-button strong { min-width: 28px; padding: 3px 8px; border-radius: 999px; background: #e8f0f7; }
    .tab-button.active { border-color: #e0ad00; background: var(--accent); }
    .tab-button.active strong { background: rgba(255, 255, 255, 0.62); }
    .tab-panel { display: none; }
    .tab-panel.active { display: block; }
    .panel-note { margin: 0 0 14px; color: var(--muted); }
    .table-wrap { overflow-x: auto; border: 1px solid var(--line); border-radius: 18px; }
    table { width: 100%; border-collapse: collapse; min-width: 760px; background: #fff; }
    th, td { padding: 12px 14px; border-bottom: 1px solid #e7eef6; text-align: left; vertical-align: top; }
    th { background: #eef4fa; color: #35556d; font-size: 12px; text-transform: uppercase; }
    tr:last-child td { border-bottom: 0; }
    .delta { font-weight: 900; }
    .delta.positive { color: #b42318; }
    .delta.negative { color: #0f7a3f; }
    .empty-state { padding: 30px; border: 1px dashed var(--line); border-radius: 18px; color: var(--muted); background: #fff; }
    .details-block { margin-top: 14px; }
    .details-block summary { cursor: pointer; color: #35556d; font-weight: 800; }
    .secondary-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-top: 18px; }
    h2 { margin: 0 0 14px; font-size: 20px; }
    @media (max-width: 920px) {
      .stats, .secondary-grid { grid-template-columns: 1fr 1fr; }
    }
    @media (max-width: 640px) {
      main { padding: 18px 12px 34px; }
      .hero, .panel { border-radius: 18px; padding: 18px; }
      .stats, .secondary-grid { grid-template-columns: 1fr; }
      .tab-button { width: 100%; justify-content: space-between; }
    }
  </style>
</head>
<body>
  <main>
    <section class="hero">
      <span class="eyebrow">Импорт прайса</span>
      <h1>Отчёт импорта</h1>
      <p class="meta">
        Сформирован: ${formatReportDate(report.generatedAt)} ·
        Источник: <span title="${escapeHtml(report.sourceFile)}">${escapeHtml(sourceFileName)}</span> ·
        JSON: ${escapeHtml(path.relative(projectRoot, reportFile))}
      </p>
    </section>

    <section class="stats">
      ${statCards
        .map(
          ([label, value]) => `
            <article class="stat">
              <span>${escapeHtml(label)}</span>
              <strong>${formatNumber(value)}</strong>
            </article>
          `
        )
        .join('')}
    </section>

    <section class="panel">
      ${renderReportTabs(report, alertPercent)}
      ${renderStockChanges(report)}
    </section>

    <section class="secondary-grid">
      <article class="panel">
        <h2>Распределение по категориям</h2>
        ${renderTable(
          categoryRows,
          [
            { key: 'category', label: 'Категория' },
            { label: 'Товаров', render: (row) => formatNumber(row.count) },
          ],
          'Категории не найдены.'
        )}
      </article>
      <article class="panel">
        <h2>Пропущенные строки</h2>
        ${renderTable(
          skipRows,
          [
            { key: 'reason', label: 'Причина' },
            { label: 'Строк', render: (row) => formatNumber(row.count) },
          ],
          'Пропущенных строк нет.'
        )}
        <details class="details-block">
          <summary>Подробности (${formatNumber(skippedRows.length)})</summary>
          ${renderTable(
            skippedRows,
            [
              {
                label: 'Строка',
                render: (row) =>
                  Number.isInteger(row.rowIndex)
                    ? formatNumber(row.rowIndex + 1)
                    : '—',
              },
              { key: 'product', label: 'Позиция' },
              { key: 'category', label: 'Категория' },
              { key: 'reason', label: 'Причина' },
              { label: 'Цена', render: (row) => formatMoney(row.price) },
              { label: 'Остаток', render: (row) => formatNumber(row.stock) },
            ],
            'Деталей по пропущенным строкам нет.'
          )}
        </details>
      </article>
      <article class="panel">
        <h2>Пороги подозрительных цен</h2>
        <p class="panel-note">
          Импортов в расчёте: ${formatNumber(report.suspiciousPriceStats?.historyImports || 0)} ·
          файл: ${escapeHtml(report.suspiciousPriceStats?.historyFile || '')}
        </p>
        ${renderSuspiciousPriceStats(report)}
      </article>
    </section>
  </main>
  <script>
    const buttons = document.querySelectorAll('[data-tab]');
    const panels = document.querySelectorAll('[data-panel]');
    buttons.forEach((button) => {
      button.addEventListener('click', () => {
        const tab = button.dataset.tab;
        buttons.forEach((item) => item.classList.toggle('active', item === button));
        panels.forEach((panel) => panel.classList.toggle('active', panel.dataset.panel === tab));
      });
    });
  </script>
</body>
</html>`;
}

async function downloadPriceFile() {
  console.log(`Скачивание прайса: ${priceUrl}`);
  const response = await fetch(priceUrl);
  if (!response.ok) {
    throw new Error(
      `Не удалось скачать прайс по URL ${priceUrl}: HTTP ${response.status}`
    );
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length === 0) {
    throw new Error(`Скачанный файл пустой: ${priceUrl}`);
  }
  await fs.mkdir(path.dirname(inputFile), { recursive: true });
  await fs.writeFile(inputFile, buffer);
  console.log(
    `Сохранено в ${inputFile} (${(buffer.length / 1024).toFixed(1)} КБ)`
  );
}

async function main() {
  if (priceUrl) {
    await downloadPriceFile();
  }
  console.log(`Чтение прайса: ${inputFile}`);
  if (isDryRun) {
    console.log('Режим: --dry-run (файлы не записываются)');
  }

  const generatedAt = new Date().toISOString();
  const importConfig = await loadImportConfig();
  const previousProducts = await loadPreviousProducts();
  const importHistory = await loadImportHistory(importConfig);
  const registry = await loadProductRegistry(registryFile);
  await loadPriceOverrides();

  const rows = await loadWorkbookRows();
  const schema = detectSchema(rows);

  if (schema.headerRowsFound === 0) {
    throw new Error(
      'Не найден ни один заголовок таблицы (наименование/ед.изм/цена/остаток). Возможно, изменилась структура прайса.'
    );
  }

  if (schema.missingHeaders.length > 0) {
    throw new Error(
      `В заголовках прайса не найдены обязательные колонки: ${schema.missingHeaders.join(', ')}. Проверь структуру файла.`
    );
  }

  const importResult = extractProducts(rows);
  const categoryByFamily = buildCategoryMap(importResult.products);

  const classifiedProducts = importResult.products.map((product) => {
    const resolved = {
      ...product,
      category: resolveCategory(product, categoryByFamily),
    };

    return {
      ...resolved,
      ...classifyProduct(resolved),
      cableDecoded: decodeCable(resolved.mark),
    };
  });

  const productsWithIdentity = classifiedProducts.map((product) => {
    const identity = assignStableIdentity(registry, product, generatedAt);
    return {
      id: identity.id,
      slug: identity.slug,
      sku: identity.sku,
      ...product,
    };
  });

  const products = productsWithIdentity.map(stripClassificationDiagnostics);

  let seoSummary = null;

  if (!isDryRun) {
    await saveProducts(products);
    await saveProductRegistry(registryFile, registry);

    try {
      const categoriesRaw = await fs.readFile(catalogCategoriesFile, 'utf-8');
      const categoriesData = JSON.parse(categoriesRaw);
      seoSummary = await writeSeoArtifacts({
        outputDir: publicDir,
        siteUrl: process.env.SITE_URL || process.env.VITE_SITE_URL,
        products,
        categoriesData,
        lastmod: generatedAt,
      });
    } catch (error) {
      console.warn(
        'Не удалось сгенерировать sitemap.xml/robots.txt:',
        error.message
      );
    }
  }

  const diff = buildDiff(previousProducts, products);
  const skipsByReason = summarizeSkips(importResult.skippedRows);
  const byCategory = summarizeByCategory(products);
  const historicalSnapshots = getHistoricalSnapshots(
    importHistory,
    previousProducts,
    inputFile
  );
  const suspiciousPriceStats = buildSuspiciousPriceStats(
    importConfig,
    historicalSnapshots
  );
  const suspicious = detectSuspicious(products, suspiciousPriceStats);
  const classification = buildClassificationReport(
    classifiedProducts,
    importConfig
  );

  const report = {
    generatedAt,
    sourceFile: inputFile,
    dryRun: isDryRun,
    schema,
    registryFile: path.relative(projectRoot, registryFile),
    registryEntries: Object.keys(registry.entries).length,
    registryNextId: registry.nextId,
    importConfigFile: path.relative(projectRoot, importConfigFile),
    priceAlertPercent: PRICE_JUMP_ALERT_PERCENT,
    summary: {
      totalRowsInSheet: importResult.totalRows,
      categoriesDetected: importResult.categoriesSeen.size,
      productsImported: products.length,
      productsPrevious: previousProducts.length,
      skippedRows: importResult.skippedRows.length,
      suspicious: suspicious.length,
      added: diff.added.length,
      removed: diff.removed.length,
      priceChanged: diff.priceChanged.length,
      priceAlerts: diff.priceAlerts.length,
      stockChanged: diff.stockChanged.length,
      categoryChanged: diff.categoryChanged.length,
      fallbackToOther: classification.fallbackToOther.count,
    },
    skipsByReason,
    productsByCategory: byCategory,
    skippedRows: importResult.skippedRows,
    suspicious,
    suspiciousPriceStats,
    classification,
    diff,
  };

  if (!isDryRun) {
    await saveReport(report);
    await saveHtmlReport(report);
    await saveImportHistory(
      importConfig,
      importHistory,
      buildHistorySnapshot(products, {
        generatedAt,
        sourceFile: inputFile,
      })
    );
  }

  console.log('');
  console.log('=== Импорт завершён ===');
  console.log(`  Товаров импортировано: ${products.length}`);
  console.log(`  Было ранее:            ${previousProducts.length}`);
  console.log(`  Категорий:             ${importResult.categoriesSeen.size}`);
  console.log(`  Пропущено строк:       ${importResult.skippedRows.length}`);
  if (Object.keys(skipsByReason).length > 0) {
    for (const [reason, count] of Object.entries(skipsByReason)) {
      console.log(`    - ${reason}: ${count}`);
    }
  }
  if (suspicious.length > 0) {
    console.log('');
    console.log(`⚠  Подозрительных цен: ${suspicious.length}`);
    for (const item of suspicious.slice(0, 5)) {
      console.log(
        `    - ${item.name} (${item.price} ₽/${item.unit || '?'}): ${item.reasons.join('; ')}`
      );
    }
    if (suspicious.length > 5) {
      console.log(`    … ещё ${suspicious.length - 5} (см. отчёт)`);
    }
  }
  console.log('');
  console.log('=== Изменения относительно предыдущего импорта ===');
  console.log(`  Добавлено:       ${diff.added.length}`);
  console.log(`  Удалено:         ${diff.removed.length}`);
  console.log(`  Изменена цена:   ${diff.priceChanged.length}`);
  console.log(`  Изменён остаток: ${diff.stockChanged.length}`);
  console.log(`  Сменили категорию: ${diff.categoryChanged.length}`);
  console.log(`  Fallback «Прочее»: ${classification.fallbackToOther.count}`);

  if (classification.fallbackToOther.topPrefixes.length > 0) {
    console.log('');
    console.log('=== Нераспознанные префиксы в «Прочее» ===');
    for (const item of classification.fallbackToOther.topPrefixes.slice(0, 5)) {
      console.log(`  ${item.prefix}: ${item.count}`);
    }
  }

  if (diff.priceAlerts.length > 0) {
    console.log('');
    console.log(
      `⚠  Резкие изменения цен (≥${PRICE_JUMP_ALERT_PERCENT}%): ${diff.priceAlerts.length}`
    );
    for (const item of diff.priceAlerts.slice(0, 5)) {
      const arrow = item.deltaPercent > 0 ? '↑' : '↓';
      console.log(
        `    ${arrow} ${item.name}: ${item.priceBefore} → ${item.priceAfter} (${item.deltaPercent > 0 ? '+' : ''}${item.deltaPercent}%)`
      );
    }
    if (diff.priceAlerts.length > 5) {
      console.log(
        `    … ещё ${diff.priceAlerts.length - 5} (см. diff.priceAlerts в отчёте)`
      );
    }
  }

  console.log('');
  console.log(
    `Реестр товаров: ${path.relative(projectRoot, registryFile)} · записей: ${Object.keys(registry.entries).length} · nextId: ${registry.nextId}`
  );
  if (seoSummary) {
    const indexRel = path.relative(projectRoot, seoSummary.indexPath);
    const robotsRel = path.relative(projectRoot, seoSummary.robotsPath);
    const {
      pages,
      categories,
      products: prodCount,
      total,
      productSitemaps,
    } = seoSummary.counts;
    const productSitemapInfo =
      productSitemaps > 1 ? `, productSitemaps:${productSitemaps}` : '';
    console.log(
      `SEO: ${indexRel} (index → pages:${pages}, categories:${categories}, products:${prodCount}${productSitemapInfo}, total:${total} URL) · ${robotsRel}`
    );
  }
  console.log(
    `Схема прайса: заголовков=${schema.headerRowsFound}, найдено=${schema.detectedHeaders.join(',')}`
  );
  if (isDryRun) {
    console.log('');
    console.log(
      '--- DRY RUN: products.json / productRegistry.json / отчёты не записаны ---'
    );
  } else {
    console.log(`JSON-отчёт: ${path.relative(projectRoot, reportFile)}`);
    console.log(`HTML-отчёт: ${path.relative(projectRoot, reportHtmlFile)}`);
    console.log(`Открыть: ${pathToFileURL(reportHtmlFile).href}`);
  }
}

main().catch((error) => {
  console.error('Ошибка импорта прайса:', error.message);
  process.exitCode = 1;
});
