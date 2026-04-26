import express from 'express';
import cors from 'cors';
import compression from 'compression';
import dotenv from 'dotenv';
import nodemailer from 'nodemailer';
import rateLimit from 'express-rate-limit';
import { createRequire } from 'module';
import { pathToFileURL } from 'url';
import {
  findProductBySlug,
  getCatalogProductListItems,
  getCatalogProductListItemsByCategory,
  getCatalogProductsByCategory,
  loadCatalogProducts,
} from './lib/catalog.js';
import {
  MAX_QUOTE_ITEMS,
  isValidQuoteRequest,
} from './lib/quoteValidation.js';
import { accessLog, logger } from './lib/logger.js';

const require = createRequire(import.meta.url);
const catalogCategoriesData = require('./data/catalogCategories.json');

dotenv.config();

const PORT = process.env.PORT || 3001;

// Honeypot: скрытое поле, которое реальный пользователь не видит и не заполняет.
// Боты обычно заполняют все input'ы подряд — отдаём им фейковый success.
function isHoneypotTriggered(body) {
  return Boolean(body && typeof body.company_website === 'string' && body.company_website.trim());
}
const DEFAULT_CATALOG_ORDER = 9999;
const DEFAULT_PRODUCTS_LIMIT = 24;
const MAX_PRODUCTS_LIMIT = 96;
const FLEXIBLE_MARK_RE = /^(КГ|ПуГ|ПВС|ШВВП|КОГ|ПРГ|ПМГ)/i;
const CANONICAL_CATEGORY_ORDER = new Map(
  catalogCategoriesData.sections.flatMap((section) =>
    section.categories.map((category, index) => [category.slug, index])
  )
);
let catalogSectionsCacheItems = null;
let catalogSectionsCache = null;

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// На POST-эндпоинтах принимаем только JSON. Без Content-Type: application/json
// express.json() оставляет req.body пустым, isValidQuoteRequest всё равно
// вернёт false — но явный 415 быстрее даёт обратную связь и режет мусор.
function requireJsonContentType(req, res, next) {
  const contentType = req.headers['content-type'] || '';
  if (!contentType.toLowerCase().includes('application/json')) {
    return res
      .status(415)
      .json({ ok: false, message: 'Ожидается Content-Type: application/json' });
  }
  return next();
}

function normalizeEmail(value) {
  return String(value ?? '').trim().toLowerCase();
}

function normalizePhoneInput(value) {
  // Сохраняем + в начале, остальное — только цифры. Валидация по длине цифр
  // живёт в isValidQuoteRequest.
  const raw = String(value ?? '').trim();
  const digits = raw.replace(/\D/g, '');
  return raw.startsWith('+') ? `+${digits}` : digits;
}

function applyCatalogCache(res) {
  res.setHeader('Cache-Control', 'public, max-age=60, must-revalidate');
}

function createTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

function createErrorResponse(res, message, status = 500) {
  return res.status(status).json({
    ok: false,
    message,
  });
}

function buildCatalogSections(items) {
  const sectionOrder = [];
  const sectionMap = new Map();

  for (const item of items) {
    const sectionSlug = item.catalogSectionSlug;
    const categorySlug = item.catalogCategorySlug;

    if (!sectionSlug || !categorySlug) {
      continue;
    }

    if (!sectionMap.has(sectionSlug)) {
      sectionOrder.push(sectionSlug);
      sectionMap.set(sectionSlug, {
        name: item.catalogSection,
        slug: sectionSlug,
        categoryOrder: [],
        categoryMap: new Map(),
      });
    }

    const section = sectionMap.get(sectionSlug);

    if (!section.categoryMap.has(categorySlug)) {
      section.categoryOrder.push(categorySlug);
      section.categoryMap.set(categorySlug, {
        name: item.catalogCategory,
        slug: categorySlug,
        count: 0,
      });
    }

    section.categoryMap.get(categorySlug).count++;
  }

  return sectionOrder.map((sectionSlug) => {
    const section = sectionMap.get(sectionSlug);
    const categories = section.categoryOrder
      .map((categorySlug) => section.categoryMap.get(categorySlug))
      .sort(
        (a, b) =>
          getCanonicalCategoryOrder(a.slug) - getCanonicalCategoryOrder(b.slug)
      );

    return {
      name: section.name,
      slug: section.slug,
      categories,
    };
  });
}

function getCatalogSections(items) {
  if (catalogSectionsCacheItems === items && catalogSectionsCache) {
    return catalogSectionsCache;
  }

  catalogSectionsCacheItems = items;
  catalogSectionsCache = buildCatalogSections(items);
  return catalogSectionsCache;
}

function getCanonicalCategoryOrder(categorySlug) {
  return CANONICAL_CATEGORY_ORDER.get(categorySlug) ?? DEFAULT_CATALOG_ORDER;
}

function normalizeSearchKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^0-9a-zа-я]+/g, '');
}

function parseCsvParam(value) {
  if (typeof value !== 'string' || !value.trim()) return [];
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseCsvNumbers(value) {
  return parseCsvParam(value)
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item));
}

function getWireConstruction(product) {
  const mark = product?.mark || '';
  return FLEXIBLE_MARK_RE.test(mark) ? 'многопроволочная' : 'однопроволочная';
}

function getConductorMaterial(product) {
  const decoded = product?.cableDecoded?.decoded;
  if (!Array.isArray(decoded)) return 'медь';
  const isAluminum = decoded.some((item) =>
    String(item).includes('алюминиевые жилы')
  );
  return isAluminum ? 'алюминий' : 'медь';
}

function getCoreVariantLabel(product) {
  const cores = normalizePositiveNumber(product?.cores);
  const groundCores = normalizePositiveNumber(product?.groundCores);

  if (!cores) return '';
  return groundCores ? `${cores}+${groundCores}` : String(cores);
}

function normalizePositiveNumber(value) {
  const normalized = Number(value);
  return Number.isFinite(normalized) && normalized > 0 ? normalized : null;
}

function getSearchFilteredProducts(items, search) {
  const query = String(search || '').trim().toLowerCase();
  if (!query) return items;

  return items.filter((product) => {
    const mark = (product.mark || '').toLowerCase();
    const title = (product.title || '').toLowerCase();
    const fullName = (product.fullName || '').toLowerCase();
    const sku = (product.sku || '').toLowerCase();
    return (
      mark.includes(query) ||
      title.includes(query) ||
      fullName.includes(query) ||
      sku.includes(query)
    );
  });
}

function buildCatalogFacets(items) {
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
    if (product.catalogApplicationType) appTypeSet.add(product.catalogApplicationType);
    if (product.catalogType === 'СПЭ') hasSPE = true;

    const price = Number(product.price);
    if (Number.isFinite(price) && price > 0) {
      if (price < minPrice) minPrice = price;
      if (price > maxPrice) maxPrice = price;
    }
  }

  return {
    materials: [...materialSet].sort((a, b) => a.localeCompare(b, 'ru')),
    constructions: [...constructionSet].sort((a, b) => a.localeCompare(b, 'ru')),
    cores: [...coreSet].sort((a, b) => a.localeCompare(b, 'ru', { numeric: true })),
    sections: [...sectionSet].sort((a, b) => a - b),
    voltages: [...voltageSet].sort((a, b) => a - b),
    appTypes: [...appTypeSet].sort((a, b) => a.localeCompare(b, 'ru')),
    hasSPE,
    minPrice: Number.isFinite(minPrice) ? minPrice : 0,
    maxPrice: Number.isFinite(maxPrice) ? maxPrice : 0,
  };
}

function applyProductFilters(items, query) {
  let result = items;
  const selectedMaterials = parseCsvParam(query.material);
  const selectedConstructions = parseCsvParam(query.construction);
  const selectedCores = parseCsvParam(query.cores);
  const selectedSections = parseCsvNumbers(query.section);
  const selectedVoltages = parseCsvNumbers(query.voltage);
  const selectedAppTypes = parseCsvParam(query.appType);
  const onlySPE = query.spe === '1';

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
    result = result.filter((item) => selectedSections.includes(item.crossSection));
  }
  if (selectedVoltages.length > 0) {
    result = result.filter((item) => selectedVoltages.includes(item.voltage));
  }
  if (selectedAppTypes.length > 0) {
    result = result.filter((item) =>
      selectedAppTypes.includes(item.catalogApplicationType)
    );
  }
  if (onlySPE) {
    result = result.filter((item) => item.catalogType === 'СПЭ');
  }

  const minPrice = Number(query.priceMin);
  const maxPrice = Number(query.priceMax);
  if (Number.isFinite(minPrice) && minPrice > 0) {
    result = result.filter((item) => Number(item.price) >= minPrice);
  }
  if (Number.isFinite(maxPrice) && maxPrice > 0) {
    result = result.filter((item) => Number(item.price) <= maxPrice);
  }

  return result;
}

function sortProducts(items, sortBy) {
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

function comparePrices(a, b, sortPrice, direction) {
  const priceA = sortPrice(a);
  const priceB = sortPrice(b);
  if (priceA === null && priceB === null) return 0;
  if (priceA === null) return 1;
  if (priceB === null) return -1;
  return direction === 1 ? priceA - priceB : priceB - priceA;
}

function parsePage(value) {
  const page = Number(value);
  if (!Number.isFinite(page) || page <= 0) return 1;
  return Math.floor(page);
}

function parseLimit(value, fallback, max) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return fallback;
  return Math.min(Math.floor(num), max);
}

function getCatalogQueryItems(allItems, category) {
  const categoryValue = typeof category === 'string' ? category.trim() : '';
  if (!categoryValue || categoryValue === 'Все') return allItems;

  const bySlug = getCatalogProductsByCategory(categoryValue, allItems);
  if (bySlug.length > 0 || CANONICAL_CATEGORY_ORDER.has(categoryValue)) {
    return bySlug;
  }

  return allItems.filter(
    (item) =>
      item.catalogCategory === categoryValue || item.category === categoryValue
  );
}

function hasProductFilters(query) {
  return [
    'search',
    'priceMin',
    'priceMax',
    'material',
    'construction',
    'cores',
    'section',
    'voltage',
    'appType',
    'spe',
  ].some((key) => typeof query[key] === 'string' && query[key].trim())
    || (typeof query.sort === 'string' &&
      query.sort.trim() &&
      query.sort !== 'default');
}

function buildProductSuggestions(items, search, limit) {
  const normalizedSearch = normalizeSearchKey(search);
  if (!normalizedSearch) return [];

  const markMap = new Map();

  for (const product of items) {
    const mark = String(product.mark || '').trim();
    if (!mark) continue;

    const key = normalizeSearchKey(mark);
    if (!key || !key.startsWith(normalizedSearch)) continue;

    const current = markMap.get(key);
    if (current) {
      current.count += 1;
    } else {
      markMap.set(key, { key, mark, count: 1 });
    }
  }

  return [...markMap.values()]
    .sort((a, b) => {
      const exactDiff =
        Number(b.key === normalizedSearch) - Number(a.key === normalizedSearch);
      if (exactDiff !== 0) return exactDiff;
      return b.count - a.count || a.mark.localeCompare(b.mark, 'ru');
    })
    .slice(0, limit);
}

const QUOTE_CHANNEL_LABELS = {
  phone: 'Звонок по телефону',
  whatsapp: 'WhatsApp',
  telegram: 'Telegram',
  email: 'Email',
};

function createQuoteItemsHtml(items) {
  return items
    .map(
      (item) => `
          <tr>
            <td style="padding:8px;border:1px solid #ddd;">${escapeHtml(item.title)}</td>
            <td style="padding:8px;border:1px solid #ddd;">${escapeHtml(item.sku) || '—'}</td>
            <td style="padding:8px;border:1px solid #ddd;">${escapeHtml(item.category)}</td>
            <td style="padding:8px;border:1px solid #ddd;">${escapeHtml(item.quantity)} ${escapeHtml(item.unit) || ''}</td>
            <td style="padding:8px;border:1px solid #ddd;">${Number(item.price || 0) > 0 ? `${escapeHtml(item.price)} ₽` : 'Рассчитать'}</td>
          </tr>
          ${
            item.comment
              ? `<tr><td colspan="5" style="padding:8px;border:1px solid #ddd;color:#555;">Комментарий: ${escapeHtml(item.comment)}</td></tr>`
              : ''
          }
        `
    )
    .join('');
}

// Фабрика express-инстанса. Каждый вызов создаёт изолированный rate limiter
// и cors-allowlist — что позволяет параллельным интеграционным тестам не
// влиять друг на друга. На проде вызывается ровно один раз из main-блока.
export function createApp({ rateLimitOptions } = {}) {
  const app = express();
  app.set('etag', false);
  app.set('trust proxy', 1);

  const quoteRateLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 5,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: {
      ok: false,
      message: 'Слишком много заявок. Попробуйте через минуту.',
    },
    ...rateLimitOptions,
  });

  // CORS-allowlist. В проде фронт и API на одном домене — CORS не нужен;
  // если ALLOWED_ORIGINS не задан, отдаём заголовки только для same-origin
  // (cors() c origin=false по сути выключает CORS). В dev указывайте
  // ALLOWED_ORIGINS=http://localhost:5173 или совпадающий VITE_SITE_URL.
  const allowedOrigins = String(process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  app.use(accessLog());
  app.use(
    cors({
      origin(origin, callback) {
        // Запросы без Origin (curl, same-origin, server-to-server) пропускаем.
        if (!origin) return callback(null, true);
        if (allowedOrigins.length === 0) return callback(null, false);
        if (allowedOrigins.includes(origin)) return callback(null, true);
        return callback(null, false);
      },
    })
  );
  app.use('/api/products', compression());
  app.use(express.json({ limit: '64kb' }));
  app.use((err, req, res, next) => {
    if (err && err.type === 'entity.too.large') {
      return res.status(413).json({ ok: false, message: 'Слишком большой запрос' });
    }
    return next(err);
  });

  // Liveness-проба для Nginx/Docker/k8s. Никакого I/O — отвечает мгновенно
  // и подтверждает, что процесс жив и event loop не залип.
  app.get('/api/health', (req, res) => {
    res.json({ ok: true, uptime: process.uptime(), ts: Date.now() });
  });

  app.get('/api/products', async (req, res) => {
    try {
      applyCatalogCache(res);

      const allItems = await loadCatalogProducts();
      const categorySlug =
        typeof req.query.category === 'string' ? req.query.category.trim() : '';
      const hasPagination = req.query.page != null || req.query.limit != null;
      const hasFilters = hasProductFilters(req.query);
      const baseItems = getCatalogQueryItems(allItems, categorySlug);
      const searchedItems = getSearchFilteredProducts(baseItems, req.query.search);
      const facets = buildCatalogFacets(searchedItems);
      const filteredItems = sortProducts(
        applyProductFilters(searchedItems, req.query),
        req.query.sort
      );
      const total = filteredItems.length;

      let responseItems;
      let pagination = null;

      if (hasPagination) {
        const limit = parseLimit(req.query.limit, DEFAULT_PRODUCTS_LIMIT, MAX_PRODUCTS_LIMIT);
        const totalPages = Math.max(1, Math.ceil(total / limit));
        const page = Math.min(parsePage(req.query.page), totalPages);
        const start = (page - 1) * limit;
        responseItems = getCatalogProductListItems(
          filteredItems.slice(start, start + limit)
        );
        pagination = { page, limit, total, totalPages };
      } else if (!hasFilters && categorySlug && CANONICAL_CATEGORY_ORDER.has(categorySlug)) {
        responseItems = getCatalogProductListItemsByCategory(categorySlug, allItems);
      } else if (!hasFilters) {
        responseItems = getCatalogProductListItems(baseItems);
      } else {
        responseItems = getCatalogProductListItems(filteredItems);
      }

      return res.json({
        ok: true,
        items: responseItems,
        meta: {
          count: responseItems.length,
          total,
          catalogCount: allItems.length,
          pagination,
          facets,
          // Дерево категорий считаем всегда по полному каталогу, чтобы фильтр в URL
          // не схлопывал боковую навигацию.
          catalogSections: getCatalogSections(allItems),
          filter: categorySlug ? { category: categorySlug } : null,
        },
      });
    } catch (error) {
      logger.error('catalog.list.failed', { err: error });
      return createErrorResponse(res, 'Не удалось загрузить каталог');
    }
  });

  app.get('/api/products/featured', async (req, res) => {
    try {
      applyCatalogCache(res);

      const limit = parseLimit(req.query.limit, 10, 50);
      const items = await loadCatalogProducts();
      const featured = [...items]
        .sort((a, b) => {
          const promotedDiff = (b.promoted ? 1 : 0) - (a.promoted ? 1 : 0);
          if (promotedDiff !== 0) return promotedDiff;
          return (b.stock || 0) - (a.stock || 0);
        })
        .slice(0, limit);

      return res.json({
        ok: true,
        items: getCatalogProductListItems(featured),
      });
    } catch (error) {
      logger.error('catalog.featured.failed', { err: error });
      return createErrorResponse(res, 'Не удалось загрузить позиции');
    }
  });

  app.get('/api/products/suggestions', async (req, res) => {
    try {
      applyCatalogCache(res);

      const limit = parseLimit(req.query.limit, 7, 20);
      const items = await loadCatalogProducts();

      return res.json({
        ok: true,
        items: buildProductSuggestions(items, req.query.search, limit),
      });
    } catch (error) {
      logger.error('catalog.suggestions.failed', { err: error });
      return createErrorResponse(res, 'Не удалось загрузить подсказки');
    }
  });

  app.get('/api/products/:slug/related', async (req, res) => {
    try {
      applyCatalogCache(res);

      const limit = parseLimit(req.query.limit, 6, 24);
      const product = await findProductBySlug(req.params.slug);

      if (!product) {
        return res.status(404).json({
          ok: false,
          message: 'Товар не найден',
        });
      }

      const items = await loadCatalogProducts();
      const related = items
        .filter(
          (item) => item.id !== product.id && item.category === product.category
        )
        .slice(0, limit);

      return res.json({
        ok: true,
        items: getCatalogProductListItems(related),
      });
    } catch (error) {
      logger.error('catalog.related.failed', { err: error, slug: req.params.slug });
      return createErrorResponse(res, 'Не удалось загрузить похожие товары');
    }
  });

  app.get('/api/products/:slug', async (req, res) => {
    try {
      applyCatalogCache(res);

      const item = await findProductBySlug(req.params.slug);

      if (!item) {
        return res.status(404).json({
          ok: false,
          message: 'Товар не найден',
        });
      }

      return res.json({
        ok: true,
        item,
      });
    } catch (error) {
      logger.error('catalog.product.failed', { err: error, slug: req.params.slug });
      return createErrorResponse(res, 'Не удалось загрузить товар');
    }
  });

  app.post('/api/quote', requireJsonContentType, quoteRateLimiter, async (req, res) => {
    try {
      if (isHoneypotTriggered(req.body)) {
        return res.json({ ok: true, message: 'Заявка успешно отправлена' });
      }

      const { customer: rawCustomer, items, totalCount, totalPrice, createdAt } = req.body;
      const customer = rawCustomer
        ? {
            ...rawCustomer,
            phone: normalizePhoneInput(rawCustomer.phone),
            email: normalizeEmail(rawCustomer.email),
          }
        : rawCustomer;

      if (!isValidQuoteRequest({ customer, items })) {
        return createErrorResponse(res, 'Некорректные данные заявки', 400);
      }

      const transporter = createTransporter();

      const html = `
        <h2>Новая заявка на коммерческое предложение</h2>

        <p><strong>Дата:</strong> ${escapeHtml(createdAt)}</p>

        <h3>Контакты клиента</h3>
        <p><strong>Имя:</strong> ${escapeHtml(customer.name)}</p>
        <p><strong>Телефон:</strong> ${escapeHtml(customer.phone)}</p>
        <p><strong>Email:</strong> ${escapeHtml(customer.email) || '—'}</p>
        <p><strong>Предпочтительный канал:</strong> ${escapeHtml(QUOTE_CHANNEL_LABELS[customer.preferredChannel] || customer.preferredChannel) || '—'}</p>
        <p><strong>Комментарий:</strong> ${escapeHtml(customer.comment) || '—'}</p>

        <h3>Состав заявки</h3>
        <table style="border-collapse:collapse;width:100%;">
          <thead>
            <tr>
              <th style="padding:8px;border:1px solid #ddd;">Товар</th>
              <th style="padding:8px;border:1px solid #ddd;">SKU</th>
              <th style="padding:8px;border:1px solid #ddd;">Категория</th>
              <th style="padding:8px;border:1px solid #ddd;">Метраж/объём</th>
              <th style="padding:8px;border:1px solid #ddd;">Цена</th>
            </tr>
          </thead>
          <tbody>
            ${createQuoteItemsHtml(items)}
          </tbody>
        </table>

        <p><strong>Всего позиций:</strong> ${totalCount}</p>
        <p><strong>Общая сумма:</strong> ${totalPrice} ₽</p>
      `;

      const replyTo = customer.email || undefined;

      await transporter.sendMail({
        from: process.env.SMTP_FROM,
        to: process.env.QUOTE_TO_EMAIL,
        ...(replyTo ? { replyTo } : {}),
        subject: 'Новая заявка на КП — ЮжУралЭлектроКабель',
        html,
      });

      return res.json({
        ok: true,
        message: 'Заявка успешно отправлена',
      });
    } catch (error) {
      logger.error('quote.send.failed', { err: error });
      return createErrorResponse(res, 'Не удалось отправить заявку');
    }
  });

  app.post('/api/lead-request', requireJsonContentType, quoteRateLimiter, async (req, res) => {
    try {
      if (isHoneypotTriggered(req.body)) {
        return res.json({ ok: true, message: 'Заявка отправлена. Мы скоро свяжемся с вами.' });
      }

      const { name, phone, comment, source, createdAt } = req.body;
      const contactName = String(name || '').trim();
      const normalizedPhone = normalizePhoneInput(phone);

      if (normalizedPhone.replace(/\D/g, '').length < 10) {
        return createErrorResponse(res, 'Укажите корректный телефон', 400);
      }

      const transporter = createTransporter();

      const html = `
        <h2>Новая короткая заявка</h2>
        <p><strong>Дата:</strong> ${escapeHtml(createdAt) || '—'}</p>
        <p><strong>Источник:</strong> ${escapeHtml(source) || '—'}</p>
        <p><strong>Контактное лицо:</strong> ${escapeHtml(contactName) || 'Не указано'}</p>
        <p><strong>Телефон:</strong> ${escapeHtml(normalizedPhone)}</p>
        <p><strong>Комментарий:</strong> ${escapeHtml(comment) || '—'}</p>
      `;

      await transporter.sendMail({
        from: process.env.SMTP_FROM,
        to: process.env.QUOTE_TO_EMAIL,
        subject: 'Новая короткая заявка — ЮжУралЭлектроКабель',
        html,
      });

      return res.json({
        ok: true,
        message: 'Заявка отправлена. Мы скоро свяжемся с вами.',
      });
    } catch (error) {
      logger.error('lead.send.failed', { err: error });
      return createErrorResponse(res, 'Не удалось отправить заявку');
    }
  });

  return app;
}

// Запускаем listen только если файл вызван напрямую (`node server.js`),
// а не импортирован тестом или другим скриптом.
const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

// Проверка обязательных env-переменных на старте. Не валим процесс —
// каталог должен работать без SMTP, — но громко предупреждаем, чтобы
// «тихая» поломка форм не дотянула до прода. В тестах не вызывается.
function warnIfSmtpMisconfigured() {
  const required = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM', 'QUOTE_TO_EMAIL'];
  const missing = required.filter((key) => !String(process.env[key] || '').trim());
  if (missing.length > 0) {
    logger.warn('startup.smtp_misconfigured', {
      missing,
      hint: 'заявки /api/quote и /api/lead-request не будут отправляться',
    });
  }
}

if (isMain) {
  warnIfSmtpMisconfigured();
  const app = createApp();
  app.listen(PORT, () => {
    logger.info('startup.listening', { port: PORT });
  });
}
