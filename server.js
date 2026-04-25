import express from 'express';
import cors from 'cors';
import compression from 'compression';
import dotenv from 'dotenv';
import nodemailer from 'nodemailer';
import { createRequire } from 'module';
import { findProductBySlug, loadCatalogProducts } from './lib/catalog.js';

const require = createRequire(import.meta.url);
const catalogCategoriesData = require('./data/catalogCategories.json');

dotenv.config();

const app = express();
app.set('etag', false);
const PORT = process.env.PORT || 3001;
const DEFAULT_CATALOG_ORDER = 9999;
const CANONICAL_CATEGORY_ORDER = new Map(
  catalogCategoriesData.sections.flatMap((section) =>
    section.categories.map((category, index) => [category.slug, index])
  )
);

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

app.use(cors());
app.use(compression());
app.use(express.json());

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

function getCanonicalCategoryOrder(categorySlug) {
  return CANONICAL_CATEGORY_ORDER.get(categorySlug) ?? DEFAULT_CATALOG_ORDER;
}

const QUOTE_CHANNEL_LABELS = {
  phone: 'Звонок по телефону',
  whatsapp: 'WhatsApp',
  telegram: 'Telegram',
  email: 'Email',
};

function isValidQuoteRequest({ customer, items }) {
  if (!customer || !Array.isArray(items) || items.length === 0) {
    return false;
  }

  const phoneDigits = String(customer.phone || '').replace(/\D/g, '');
  if (phoneDigits.length < 10) {
    return false;
  }

  // Email опционален. Но если он есть — должен быть валидным.
  const email = String(customer.email || '').trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return false;
  }

  // Если клиент выбрал email как канал связи — он обязан быть.
  if (customer.preferredChannel === 'email' && !email) {
    return false;
  }

  return true;
}

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

app.get('/api/products', async (req, res) => {
  try {
    applyCatalogCache(res);

    const allItems = await loadCatalogProducts();
    const categorySlug =
      typeof req.query.category === 'string' ? req.query.category.trim() : '';
    const items = categorySlug
      ? allItems.filter((item) => item.catalogCategorySlug === categorySlug)
      : allItems;

    return res.json({
      ok: true,
      items,
      meta: {
        count: items.length,
        // Дерево категорий считаем всегда по полному каталогу, чтобы фильтр в URL
        // не схлопывал боковую навигацию.
        catalogSections: buildCatalogSections(allItems),
        filter: categorySlug ? { category: categorySlug } : null,
      },
    });
  } catch (error) {
    console.error('Ошибка чтения каталога:', error);
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
      items: featured,
    });
  } catch (error) {
    console.error('Ошибка чтения избранных товаров:', error);
    return createErrorResponse(res, 'Не удалось загрузить позиции');
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
      items: related,
    });
  } catch (error) {
    console.error('Ошибка чтения похожих товаров:', error);
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
    console.error('Ошибка чтения товара:', error);
    return createErrorResponse(res, 'Не удалось загрузить товар');
  }
});

function parseLimit(value, fallback, max) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return fallback;
  return Math.min(Math.floor(num), max);
}

app.post('/api/quote', async (req, res) => {
  try {
    const { customer, items, totalCount, totalPrice, createdAt } = req.body;

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

    const replyTo = String(customer.email || '').trim() || undefined;

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
    console.error('Ошибка отправки заявки:', error);
    return createErrorResponse(res, 'Не удалось отправить заявку');
  }
});

app.post('/api/lead-request', async (req, res) => {
  try {
    const { name, phone, comment, source, createdAt } = req.body;
    const contactName = String(name || '').trim();

    const normalizedPhone = String(phone || '').replace(/\D/g, '');

    if (normalizedPhone.length < 10) {
      return createErrorResponse(res, 'Укажите корректный телефон', 400);
    }

    const transporter = createTransporter();

    const html = `
      <h2>Новая короткая заявка</h2>
      <p><strong>Дата:</strong> ${escapeHtml(createdAt) || '—'}</p>
      <p><strong>Источник:</strong> ${escapeHtml(source) || '—'}</p>
      <p><strong>Контактное лицо:</strong> ${escapeHtml(contactName) || 'Не указано'}</p>
      <p><strong>Телефон:</strong> ${escapeHtml(phone)}</p>
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
    console.error('Ошибка отправки заявки с главной:', error);
    return createErrorResponse(res, 'Не удалось отправить заявку');
  }
});

app.listen(PORT, () => {
  console.log(`API server started: http://localhost:${PORT}`);
});
