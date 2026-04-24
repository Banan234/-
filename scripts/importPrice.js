import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  buildCategoryMap,
  createEmptyImportResult,
  normalizeImportedProduct,
  parseCombinedCell,
  resolveCategory,
} from './lib/priceParser.js';
import { classifyProduct, decodeCable } from './lib/catalogClassifier.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const inputFile =
  process.argv[2] || path.join(projectRoot, 'data', 'price.xls');
const outputFile = path.join(projectRoot, 'data', 'products.json');
const reportFile = path.join(projectRoot, 'data', 'import-report.json');
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

function createProductRecord(product, category, sourceRow = null, rowIndex = null) {
  const normalized = normalizeImportedProduct({
    ...product,
    category,
  });

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
    console.warn('Не удалось прочитать предыдущий products.json:', error.message);
    return [];
  }
}

function productKey(product) {
  return String(product?.fullName || product?.name || '').trim().toLowerCase();
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

// Пороги подозрительных цен подобраны по распределению существующего прайса.
// Реальный P99 для кабеля ~3200 ₽/м, для штучного товара ~24000 ₽/шт, поэтому
// значения сильно выше этого — почти всегда ошибка ввода (напр. цена за км
// записана как за м, или лишние нули).
const SUSPICIOUS_PRICE_THRESHOLDS = {
  м: 10000,
  шт: 500000,
  кг: 100000,
  уп: 50000,
};

const PRICE_JUMP_ALERT_PERCENT = 50;

function detectSuspicious(products) {
  const issues = [];

  for (const product of products) {
    const reasons = [];

    if (!product.unit) {
      reasons.push('Не определена единица измерения');
    }

    if (product.price <= 0) {
      reasons.push('Отсутствует цена');
    }

    const threshold = SUSPICIOUS_PRICE_THRESHOLDS[product.unit];
    if (threshold && product.price > threshold) {
      reasons.push(
        `Цена ${product.price} ₽ за «${product.unit}» превышает порог ${threshold}`
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
  return Object.fromEntries(
    [...counts.entries()].sort((a, b) => b[1] - a[1])
  );
}

async function saveReport(report) {
  await fs.mkdir(path.dirname(reportFile), { recursive: true });
  await fs.writeFile(reportFile, JSON.stringify(report, null, 2), 'utf-8');
}

async function main() {
  console.log(`Чтение прайса: ${inputFile}`);

  const previousProducts = await loadPreviousProducts();

  const rows = await loadWorkbookRows();
  const importResult = extractProducts(rows);
  const categoryByFamily = buildCategoryMap(importResult.products);

  const products = importResult.products.map((product) => {
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

  await saveProducts(products);

  const diff = buildDiff(previousProducts, products);
  const skipsByReason = summarizeSkips(importResult.skippedRows);
  const byCategory = summarizeByCategory(products);
  const suspicious = detectSuspicious(products);

  const report = {
    generatedAt: new Date().toISOString(),
    sourceFile: inputFile,
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
    },
    skipsByReason,
    productsByCategory: byCategory,
    skippedRows: importResult.skippedRows,
    suspicious,
    diff,
  };

  await saveReport(report);

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
  console.log(`Отчёт: ${path.relative(projectRoot, reportFile)}`);
}

main().catch((error) => {
  console.error('Ошибка импорта прайса:', error.message);
  process.exitCode = 1;
});
