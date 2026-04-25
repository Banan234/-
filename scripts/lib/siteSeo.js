// Генерация sitemap.xml и robots.txt для статических страниц + всех
// карточек товара. Запускается из scripts/importPrice.js после того, как
// products.json и categories посчитаны — чтобы карта сайта всегда
// соответствовала текущему ассортименту.

import fs from 'fs/promises';
import path from 'path';

const DEFAULT_SITE_URL =
  process.env.SITE_URL ||
  process.env.VITE_SITE_URL ||
  'https://yuzhuralelectrokabel.ru';

const STATIC_ROUTES = [
  { path: '/', changefreq: 'daily', priority: '1.0' },
  { path: '/catalog', changefreq: 'daily', priority: '0.9' },
  { path: '/delivery', changefreq: 'monthly', priority: '0.5' },
  { path: '/payment', changefreq: 'monthly', priority: '0.4' },
  { path: '/about', changefreq: 'monthly', priority: '0.4' },
  { path: '/contacts', changefreq: 'monthly', priority: '0.5' },
];

function trimTrailingSlash(value) {
  return String(value || '').replace(/\/+$/, '');
}

function escapeXml(value) {
  return String(value || '').replace(/[<>&'"]/g, (ch) => {
    switch (ch) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case "'": return '&apos;';
      case '"': return '&quot;';
      default: return ch;
    }
  });
}

function buildUrlEntry({ loc, lastmod, changefreq, priority }) {
  const lines = [`    <loc>${escapeXml(loc)}</loc>`];
  if (lastmod) lines.push(`    <lastmod>${escapeXml(lastmod)}</lastmod>`);
  if (changefreq) lines.push(`    <changefreq>${changefreq}</changefreq>`);
  if (priority) lines.push(`    <priority>${priority}</priority>`);
  return `  <url>\n${lines.join('\n')}\n  </url>`;
}

function collectCategoryRoutes(categoriesData) {
  const routes = [];
  const sections = Array.isArray(categoriesData?.sections)
    ? categoriesData.sections
    : [];

  for (const section of sections) {
    if (section.slug) {
      routes.push({
        path: `/catalog/${section.slug}`,
        changefreq: 'weekly',
        priority: '0.7',
      });
    }
    const categories = Array.isArray(section.categories) ? section.categories : [];
    for (const category of categories) {
      if (!category.slug) continue;
      // Подкатегории живут на том же роуте /catalog/:slug — он умеет искать
      // и section.slug, и category.slug в catalogCategories.json.
      routes.push({
        path: `/catalog/${category.slug}`,
        changefreq: 'weekly',
        priority: '0.7',
      });
    }
  }

  // Доп. подкатегория — некабельная продукция (она прописана в роутере,
  // но не лежит в sections). Дублирование с фильтром через slug допустимо.
  routes.push({
    path: '/catalog/nekabelnaya-produkciya',
    changefreq: 'weekly',
    priority: '0.6',
  });

  // Дедупликация по path — на случай если какая-то подкатегория совпадёт.
  const seen = new Set();
  return routes.filter((route) => {
    if (seen.has(route.path)) return false;
    seen.add(route.path);
    return true;
  });
}

function collectProductRoutes(products) {
  if (!Array.isArray(products)) return [];
  const seen = new Set();
  const routes = [];
  for (const product of products) {
    const slug = product?.slug;
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    routes.push({
      path: `/product/${slug}`,
      changefreq: 'weekly',
      priority: '0.6',
    });
  }
  return routes;
}

export function buildSitemapXml({
  siteUrl = DEFAULT_SITE_URL,
  products = [],
  categoriesData = null,
  lastmod = new Date().toISOString(),
} = {}) {
  const base = trimTrailingSlash(siteUrl);
  const allRoutes = [
    ...STATIC_ROUTES,
    ...collectCategoryRoutes(categoriesData),
    ...collectProductRoutes(products),
  ];

  const entries = allRoutes.map((route) =>
    buildUrlEntry({
      loc: `${base}${route.path}`,
      lastmod,
      changefreq: route.changefreq,
      priority: route.priority,
    })
  );

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    entries.join('\n'),
    '</urlset>',
    '',
  ].join('\n');
}

export function buildRobotsTxt({ siteUrl = DEFAULT_SITE_URL } = {}) {
  const base = trimTrailingSlash(siteUrl);
  return [
    'User-agent: *',
    'Allow: /',
    // SPA-служебные каталоги — на всякий случай прячем от ботов.
    'Disallow: /api/',
    'Disallow: /cart',
    'Disallow: /favorites',
    '',
    `Sitemap: ${base}/sitemap.xml`,
    '',
  ].join('\n');
}

export async function writeSeoArtifacts({
  outputDir,
  siteUrl,
  products,
  categoriesData,
  lastmod,
}) {
  await fs.mkdir(outputDir, { recursive: true });

  const sitemapXml = buildSitemapXml({
    siteUrl,
    products,
    categoriesData,
    lastmod,
  });
  const robotsTxt = buildRobotsTxt({ siteUrl });

  const sitemapPath = path.join(outputDir, 'sitemap.xml');
  const robotsPath = path.join(outputDir, 'robots.txt');

  await fs.writeFile(sitemapPath, sitemapXml, 'utf-8');
  await fs.writeFile(robotsPath, robotsTxt, 'utf-8');

  return {
    sitemapPath,
    robotsPath,
    urlCount: sitemapXml.match(/<url>/g)?.length || 0,
  };
}
