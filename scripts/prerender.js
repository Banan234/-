// Build-time prerender для статических страниц и карточек товаров.
// Запускается после `vite build` и пишет в dist/<route>/index.html
// HTML-шаблоны с заполненным <head> (title, meta, OG, Twitter, JSON-LD)
// и минимальным body-shell, чтобы Яндекс/боты, которые не выполняют JS,
// видели осмысленный контент. На пользователях с JS работает SPA как раньше:
// React.createRoot(...) при гидрации перезаписывает содержимое #root.
// Карточки товара пишутся плоско в dist/product/<slug>.html, чтобы не плодить
// тысячи директорий и не раздувать Docker layer/block-size overhead.
//
// Запуск: node scripts/prerender.js
// Зависит от: dist/index.html (из vite build), data/products.json (из импортёра).

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  buildProductBreadcrumbJsonLd,
  buildProductJsonLd,
  buildProductMetaDescription,
  getProductBreadcrumbs,
} from '../src/lib/productSeo.js';
import {
  SITE_DESCRIPTION,
  SITE_LOGO_PATH,
  SITE_NAME,
  SITE_URL,
  absoluteUrl,
} from '../src/lib/siteConfig.js';
import { normalizeMetaDescription } from '../src/lib/metaDescription.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const distDir = path.join(repoRoot, 'dist');
const productsFile = path.join(repoRoot, 'data', 'products.json');

export const STATIC_ROUTES = [
  {
    path: '/',
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    h1: `${SITE_NAME} — оптовая поставка кабельной продукции`,
    intro:
      'Оптовая поставка кабеля и провода в Челябинске и по России. Склад, отгрузка от 1 дня, работа с юрлицами по НДС.',
  },
  {
    path: '/catalog',
    title: `Каталог кабельной продукции — ${SITE_NAME}`,
    description:
      'Полный каталог кабельно-проводниковой продукции: силовые кабели, провода, контрольные кабели и СПЭ. 6 700+ позиций со склада в Челябинске.',
    h1: 'Каталог кабельной продукции',
    intro:
      'Силовые и контрольные кабели, провода, кабели СПЭ. Все позиции — со склада в Челябинске, отгрузка от 1 дня.',
  },
  {
    path: '/about',
    title: `О компании — ${SITE_NAME}`,
    description:
      'ООО «ЮжУралЭлектроКабель» — оптовый поставщик кабельной продукции в Челябинске. Прямые контракты с заводами, работа с юрлицами по НДС.',
    h1: 'О компании',
    intro:
      'Поставляем кабель и провод оптом для строительных и промышленных компаний Урала и России с прямыми контрактами с заводами-изготовителями.',
  },
  {
    path: '/contacts',
    title: `Контакты — ${SITE_NAME}`,
    description:
      'Адрес склада в Челябинске, телефоны отдела продаж, email для запроса коммерческих предложений. Реквизиты ООО «ЮжУралЭлектроКабель».',
    h1: 'Контакты',
    intro:
      'Адрес склада, телефоны отдела продаж, email для коммерческих предложений и реквизиты компании.',
  },
  {
    path: '/delivery',
    title: `Доставка — ${SITE_NAME}`,
    description:
      'Условия доставки кабельной продукции: самовывоз со склада в Челябинске, транспортные компании по России, отгрузка от 1 дня.',
    h1: 'Доставка',
    intro:
      'Самовывоз со склада в Челябинске, отправка ТК по России. Отгрузка от 1 рабочего дня после оплаты.',
  },
  {
    path: '/payment',
    title: `Оплата — ${SITE_NAME}`,
    description:
      'Способы оплаты для юридических лиц: безналичный расчёт по счёту, работа с НДС, договор поставки. Отсрочка платежа по согласованию.',
    h1: 'Оплата',
    intro:
      'Работаем с юрлицами по безналичному расчёту с НДС. Договор поставки, отсрочка платежа — по согласованию.',
  },
];

const PRODUCT_SLUG_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const URL_OR_ROOT_PATH_RE = /^(https?:\/\/[^\s"<>]+|\/(?!\/)[^\s"<>]*)$/i;
const PRODUCT_NAME_FIELDS = ['title', 'fullName', 'name'];
const OPTIONAL_STRING_FIELDS = [
  'title',
  'fullName',
  'name',
  'mark',
  'description',
  'shortDescription',
  'sku',
  'unit',
  'category',
  'sourceCategory',
  'catalogSection',
  'catalogCategory',
  'catalogType',
  'catalogApplicationType',
  'catalogBrand',
  'manufacturer',
];
const OPTIONAL_SLUG_FIELDS = ['catalogSectionSlug', 'catalogCategorySlug'];
const OPTIONAL_NON_NEGATIVE_NUMBER_FIELDS = ['price', 'stock'];
const OPTIONAL_POSITIVE_NUMBER_FIELDS = [
  'cores',
  'crossSection',
  'groundCores',
  'groundSection',
  'voltage',
];
const MAX_VALIDATION_ISSUES_IN_MESSAGE = 20;

export class PrerenderProductValidationError extends Error {
  constructor(issues, { source = 'products.json' } = {}) {
    const visibleIssues = issues
      .slice(0, MAX_VALIDATION_ISSUES_IN_MESSAGE)
      .map((issue) => `- ${issue.path}: ${issue.message}`)
      .join('\n');
    const hiddenCount = issues.length - MAX_VALIDATION_ISSUES_IN_MESSAGE;
    const hiddenMessage =
      hiddenCount > 0 ? `\n- ... ещё ${hiddenCount} ошибок` : '';

    super(
      `[prerender] ${source} не прошёл проверку схемы товара: ${issues.length} ошибок.\n` +
        `${visibleIssues}${hiddenMessage}`
    );
    this.name = 'PrerenderProductValidationError';
    this.issues = issues;
    this.source = source;
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isFiniteNumberLike(value) {
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'string' || value.trim() === '') return false;
  return Number.isFinite(Number(value.replace(',', '.')));
}

function numberLikeValue(value) {
  return typeof value === 'number' ? value : Number(value.replace(',', '.'));
}

function isPositiveIntegerLike(value) {
  if (!isFiniteNumberLike(value)) return false;
  const number = numberLikeValue(value);
  return Number.isSafeInteger(number) && number > 0;
}

function isValidSlug(value) {
  return isNonEmptyString(value) && PRODUCT_SLUG_RE.test(value);
}

function isValidPublicAssetUrl(value) {
  return typeof value === 'string' && URL_OR_ROOT_PATH_RE.test(value);
}

function addIssue(issues, path, message) {
  issues.push({ path, message });
}

export function extractProductsPayload(
  payload,
  { source = 'products.json' } = {}
) {
  if (Array.isArray(payload)) return payload;
  if (isPlainObject(payload) && Array.isArray(payload.items)) {
    return payload.items;
  }

  throw new PrerenderProductValidationError(
    [
      {
        path: '$',
        message: 'ожидался массив товаров или объект с массивом items',
      },
    ],
    { source }
  );
}

export function validatePrerenderProducts(
  products,
  { source = 'products.json' } = {}
) {
  const issues = [];

  if (!Array.isArray(products)) {
    addIssue(issues, '$', 'ожидался массив товаров');
  } else {
    products.forEach((product, index) => {
      const itemPath = `items[${index}]`;
      if (!isPlainObject(product)) {
        addIssue(issues, itemPath, 'ожидался объект товара');
        return;
      }

      if (!isValidSlug(product.slug)) {
        addIssue(
          issues,
          `${itemPath}.slug`,
          'обязательный URL-сегмент: латиница, цифры и дефисы без /, пробелов и query'
        );
      }

      const hasDisplayName = PRODUCT_NAME_FIELDS.some((field) =>
        isNonEmptyString(product[field])
      );
      if (!hasDisplayName) {
        addIssue(
          issues,
          `${itemPath}.title/fullName/name`,
          'нужно хотя бы одно непустое название товара'
        );
      }

      const hasJsonLdSku =
        isNonEmptyString(product.sku) || isPositiveIntegerLike(product.id);
      if (!hasJsonLdSku) {
        addIssue(
          issues,
          `${itemPath}.sku`,
          'нужен непустой sku или положительный числовой id для JSON-LD'
        );
      }

      if (product.id != null && !isPositiveIntegerLike(product.id)) {
        addIssue(
          issues,
          `${itemPath}.id`,
          'должен быть положительным целым числом'
        );
      }

      for (const field of OPTIONAL_STRING_FIELDS) {
        if (product[field] != null && typeof product[field] !== 'string') {
          addIssue(
            issues,
            `${itemPath}.${field}`,
            'должно быть строкой или null'
          );
        }
      }

      for (const field of OPTIONAL_SLUG_FIELDS) {
        const value = product[field];
        if (value == null || value === '') continue;
        if (!isValidSlug(value)) {
          addIssue(
            issues,
            `${itemPath}.${field}`,
            'должен быть URL-сегментом: латиница, цифры и дефисы'
          );
        }
      }

      for (const field of OPTIONAL_NON_NEGATIVE_NUMBER_FIELDS) {
        const value = product[field];
        if (value == null || value === '') continue;
        if (!isFiniteNumberLike(value) || numberLikeValue(value) < 0) {
          addIssue(issues, `${itemPath}.${field}`, 'должно быть числом >= 0');
        }
      }

      for (const field of OPTIONAL_POSITIVE_NUMBER_FIELDS) {
        const value = product[field];
        if (value == null || value === '') continue;
        if (!isFiniteNumberLike(value) || numberLikeValue(value) <= 0) {
          addIssue(issues, `${itemPath}.${field}`, 'должно быть числом > 0');
        }
      }

      if (product.image != null && product.image !== '') {
        if (!isValidPublicAssetUrl(product.image)) {
          addIssue(
            issues,
            `${itemPath}.image`,
            'должен быть http(s)-URL или root-relative путь вида /image.png'
          );
        }
      }
    });
  }

  if (issues.length > 0) {
    throw new PrerenderProductValidationError(issues, { source });
  }

  return products;
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function buildMetaTags({
  title,
  description,
  canonical,
  ogType = 'website',
  ogImage,
}) {
  const fullTitle = title;
  const metaDescription = normalizeMetaDescription(description);
  const image = ogImage || absoluteUrl(SITE_LOGO_PATH);
  return [
    `<title>${escapeHtml(fullTitle)}</title>`,
    `<meta name="description" content="${escapeHtml(metaDescription)}">`,
    `<link rel="canonical" href="${escapeHtml(canonical)}">`,
    `<meta property="og:site_name" content="${escapeHtml(SITE_NAME)}">`,
    `<meta property="og:locale" content="ru_RU">`,
    `<meta property="og:type" content="${escapeHtml(ogType)}">`,
    `<meta property="og:title" content="${escapeHtml(fullTitle)}">`,
    `<meta property="og:description" content="${escapeHtml(metaDescription)}">`,
    `<meta property="og:url" content="${escapeHtml(canonical)}">`,
    `<meta property="og:image" content="${escapeHtml(image)}">`,
    `<meta property="og:image:alt" content="${escapeHtml(fullTitle)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${escapeHtml(fullTitle)}">`,
    `<meta name="twitter:description" content="${escapeHtml(metaDescription)}">`,
    `<meta name="twitter:image" content="${escapeHtml(image)}">`,
  ].join('\n    ');
}

export function buildJsonLdScripts(payloads, idPrefix = 'prerender') {
  return payloads
    .filter(Boolean)
    .map(
      (payload, index) =>
        `<script type="application/ld+json" id="${idPrefix}-${index}">${JSON.stringify(
          payload
        ).replace(/</g, '\\u003c')}</script>`
    )
    .join('\n    ');
}

export function buildBreadcrumbsHtml(crumbs) {
  return [
    '<nav aria-label="Хлебные крошки" class="prerender-only" style="display:none">',
    '  <ol>',
    ...crumbs.map(
      (item) =>
        `    <li><a href="${escapeHtml(item.to)}">${escapeHtml(
          item.label
        )}</a></li>`
    ),
    '  </ol>',
    '</nav>',
  ].join('\n');
}

export function buildProductBodyShell(product) {
  const crumbs = getProductBreadcrumbs(product);
  const description = buildProductMetaDescription(product);
  const heading =
    product.title || product.fullName || product.name || product.mark || '';

  // Минимальный shell для краулеров. Скрыт от пользователя через
  // class="prerender-only" + display:none — React при mount() всё равно
  // снесёт содержимое #root и отрисует SPA, так что флэша не будет.
  const specs = [];
  if (product.mark) specs.push(['Марка', product.mark]);
  if (product.crossSection)
    specs.push(['Сечение', `${product.crossSection} мм²`]);
  if (product.cores) {
    const groundLabel = product.groundCores
      ? `${product.cores}+${product.groundCores}`
      : product.cores;
    specs.push(['Жилы', String(groundLabel)]);
  }
  if (product.voltage) specs.push(['Напряжение', `${product.voltage} В`]);
  if (product.catalogCategory)
    specs.push(['Категория', product.catalogCategory]);
  if (product.manufacturer || product.catalogBrand) {
    specs.push(['Производитель', product.manufacturer || product.catalogBrand]);
  }

  const specsHtml =
    specs.length > 0
      ? [
          '<dl class="prerender-only" style="display:none">',
          ...specs.map(
            ([label, value]) =>
              `  <dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`
          ),
          '</dl>',
        ].join('\n')
      : '';

  return `
<div class="prerender-only" style="display:none">
  <h1>${escapeHtml(heading)}</h1>
  <p>${escapeHtml(description)}</p>
  ${buildBreadcrumbsHtml(crumbs)}
  ${specsHtml}
  <p><noscript>Включите JavaScript для просмотра карточки товара полностью.</noscript></p>
</div>`.trim();
}

export function buildCompactProductBodyShell(product) {
  const description = buildProductMetaDescription(product);
  const heading =
    product.title || product.fullName || product.name || product.mark || '';

  return `<div class="prerender-only" style="display:none"><h1>${escapeHtml(
    heading
  )}</h1><p>${escapeHtml(description)}</p></div>`;
}

export function buildStaticBodyShell(route) {
  const crumbs =
    route.path === '/'
      ? [{ label: 'Главная', to: '/' }]
      : [
          { label: 'Главная', to: '/' },
          { label: route.h1, to: route.path, isCurrent: true },
        ];

  return `
<div class="prerender-only" style="display:none">
  <h1>${escapeHtml(route.h1)}</h1>
  <p>${escapeHtml(route.intro)}</p>
  ${buildBreadcrumbsHtml(crumbs)}
</div>`.trim();
}

export function injectIntoTemplate(template, { headExtras, bodyShell }) {
  // Стираем уже существующий <title> и наши же мета-теги, чтобы повторный
  // прогон не дублировал теги (если кто-то запустит prerender на уже
  // обработанном dist).
  let html = stripPrerenderManagedHead(template);

  html = html.replace('</head>', `    ${headExtras}\n  </head>`);
  html = html.replace(
    /<div id="root">[\s\S]*?<\/div>/,
    `<div id="root">${bodyShell}</div>`
  );

  return html;
}

export function stripPrerenderManagedHead(html) {
  return html
    .replace(/<title>[^<]*<\/title>/i, '')
    .replace(/<meta\s+name="description"[^>]*>/gi, '')
    .replace(/<meta\s+property="og:[^"]*"[^>]*>/gi, '')
    .replace(/<meta\s+name="twitter:[^"]*"[^>]*>/gi, '')
    .replace(/<link\s+rel="canonical"[^>]*>/gi, '')
    .replace(
      /<script[^>]*type="application\/ld\+json"[^>]*>[\s\S]*?<\/script>/gi,
      ''
    );
}

export function minifyPrerenderHtml(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/>\s+</g, '><')
    .trim();
}

function getRuntimeHeadShell(template) {
  const strippedTemplate = stripPrerenderManagedHead(template);
  const match = strippedTemplate.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  return minifyPrerenderHtml(match?.[1] || '');
}

export function injectIntoThinTemplate(template, { headExtras, bodyShell }) {
  const runtimeHeadShell = getRuntimeHeadShell(template);

  return minifyPrerenderHtml(
    [
      '<!doctype html>',
      '<html lang="ru">',
      '<head>',
      runtimeHeadShell,
      headExtras,
      '</head>',
      '<body>',
      `<div id="root">${bodyShell}</div>`,
      '</body>',
      '</html>',
    ].join('')
  );
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

export async function writeRoute(
  routePath,
  html,
  { outputDir = distDir } = {}
) {
  const trimmed = routePath.replace(/^\/+/, '').replace(/\/+$/, '');
  const dir = trimmed ? path.join(outputDir, trimmed) : outputDir;
  await ensureDir(dir);
  await fs.writeFile(path.join(dir, 'index.html'), html, 'utf8');
}

export async function writeProductRoute(
  slug,
  html,
  { outputDir = distDir } = {}
) {
  const dir = path.join(outputDir, 'product');
  await ensureDir(dir);
  await fs.writeFile(path.join(dir, `${slug}.html`), html, 'utf8');
}

export async function loadTemplate({ outputDir = distDir } = {}) {
  const template = await fs.readFile(
    path.join(outputDir, 'index.html'),
    'utf8'
  );
  if (!/<div id="root">/.test(template)) {
    throw new Error(
      'dist/index.html не содержит <div id="root"> — vite build не отработал?'
    );
  }
  return template;
}

export async function loadProducts({
  filePath = productsFile,
  warn = console.warn,
} = {}) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      throw new Error(
        `[prerender] ${filePath} содержит некорректный JSON: ${error.message}`
      );
    }
    return extractProductsPayload(parsed, { source: filePath });
  } catch (error) {
    if (error.code === 'ENOENT') {
      warn?.(
        `[prerender] data/products.json не найден — карточки товара будут пропущены.\n` +
          `           Запустите npm run import:price перед сборкой.`
      );
      return [];
    }
    throw error;
  }
}

export async function prerenderStatic(
  template,
  { outputDir = distDir, log = console.log } = {}
) {
  for (const route of STATIC_ROUTES) {
    const canonical = absoluteUrl(route.path);
    const headExtras = [
      buildMetaTags({
        title: route.title,
        description: route.description,
        canonical,
        ogType: route.path === '/' ? 'website' : 'article',
      }),
    ].join('\n    ');
    const html = injectIntoTemplate(template, {
      headExtras,
      bodyShell: buildStaticBodyShell(route),
    });
    await writeRoute(route.path, html, { outputDir });
  }
  log?.(
    `[prerender] static: ${STATIC_ROUTES.length} pages → dist/{${STATIC_ROUTES.map(
      (r) => r.path
    ).join(', ')}}`
  );
}

export async function prerenderProducts(
  template,
  products,
  { outputDir = distDir, log = console.log, validate = true } = {}
) {
  if (validate) {
    validatePrerenderProducts(products);
  }

  await fs.rm(path.join(outputDir, 'product'), {
    recursive: true,
    force: true,
  });

  let written = 0;
  for (const product of products) {
    const canonical = absoluteUrl(`/product/${product.slug}`);
    // На текущих данных поставщика часть позиций приходит без product.title,
    // но всегда есть fullName или name. Fallback идентичен тому, что делает
    // buildProductJsonLd → поле name.
    const productLabel =
      product.title || product.fullName || product.name || product.mark || '';
    const fullTitle = productLabel
      ? `${productLabel} — ${SITE_NAME}`
      : SITE_NAME;
    const description = buildProductMetaDescription(product);
    const ogImage = product.image ? absoluteUrl(product.image) : undefined;
    const productLd = buildProductJsonLd(product);
    const breadcrumbLd = buildProductBreadcrumbJsonLd(product);

    const headExtras = [
      buildMetaTags({
        title: fullTitle,
        description,
        canonical,
        ogType: 'product',
        ogImage,
      }),
      buildJsonLdScripts([breadcrumbLd, productLd], 'product-ld'),
    ].join('\n    ');

    const html = injectIntoThinTemplate(template, {
      headExtras,
      bodyShell: buildCompactProductBodyShell(product),
    });
    await writeProductRoute(product.slug, html, { outputDir });
    written += 1;
  }
  log?.(
    `[prerender] products: ${written}/${products.length} pages → dist/product/<slug>.html`
  );
}

export async function prerender({
  outputDir = distDir,
  productsPath = productsFile,
  log = console.log,
  warn = console.warn,
} = {}) {
  const template = await loadTemplate({ outputDir });
  const products = await loadProducts({ filePath: productsPath, warn });
  validatePrerenderProducts(products, { source: productsPath });
  await prerenderStatic(template, { outputDir, log });
  await prerenderProducts(template, products, {
    outputDir,
    log,
    validate: false,
  });
  log?.('[prerender] done.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  prerender().catch((error) => {
    console.error('[prerender] failed:', error);
    process.exit(1);
  });
}
