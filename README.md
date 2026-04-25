# ЮжУралЭлектроКабель — сайт + B2B-каталог

React 18 + Vite + Express. Каталог из 6 700+ позиций импортируется из прайса Excel,
заявки уходят на почту менеджеру, аналитика — Яндекс.Метрика, для SEO
генерируются sitemap.xml/robots.txt и JSON-LD (Product + Organization).

## Быстрый старт

```bash
git clone …
cd yuzhural-site
npm install
cp .env.example .env   # заполните по комментариям внутри файла
npm run dev            # фронт на 5173, API на 3001
```

Полный набор команд:

| Команда | Что делает |
| --- | --- |
| `npm run dev` | Vite + сервер, прокси /api/* |
| `npm run build` | Прод-сборка в `dist/` |
| `npm run preview` | Локальный smoke-тест прод-сборки |
| `npx vitest run` | Тесты (39 кейсов) |
| `node scripts/importPrice.js [path/to/price.xls]` | Импорт прайса → `data/products.json`, отчёты, `public/sitemap.xml`, `public/robots.txt` |
| `node scripts/importPrice.js --dry-run` | То же, но без записи файлов |

## Конфигурация (`.env`)

Все переменные описаны в [`.env.example`](./.env.example). Кратко:

### Почта (SMTP)

`server.js` использует `nodemailer`. Без валидного SMTP-блока заявки из формы
КП не отправятся, а пользователь получит ошибку «Не удалось отправить заявку».

1. Заведите ящик на корпоративном домене (Яндекс.360, Mail для бизнеса и т.п.).
2. Включите двухфакторную аутентификацию и выпустите **app password** —
   обычный пароль почты Яндекс не пропустит, нужен именно специальный пароль
   для приложений.
3. Заполните в `.env`:
   ```
   SMTP_HOST=smtp.yandex.ru
   SMTP_PORT=465
   SMTP_SECURE=true
   SMTP_USER=sale@yourdomain.ru
   SMTP_PASS=<app password>
   SMTP_FROM="ООО ЮжУралЭлектроКабель <sale@yourdomain.ru>"
   QUOTE_TO_EMAIL=sale@yourdomain.ru
   ```
4. Перезапустите `npm run dev`. Проверить можно так:
   ```bash
   curl -X POST http://localhost:3001/api/quote \
     -H 'content-type: application/json' \
     -d '{"customer":{"name":"Test","phone":"+79991112233"},"items":[{"title":"ВВГнг 3х2.5","quantity":100,"unit":"м","price":120}]}'
   ```

> `From:` и `SMTP_USER` должны указывать на один и тот же ящик (или его алиас),
> иначе провайдер отклонит письмо. `Reply-To:` сервер подставляет из email
> клиента только если он его сам указал в форме (поле опциональное).

### Аналитика

`VITE_YANDEX_METRIKA_ID` — номер счётчика. Пустое значение полностью отключает
Метрику, скрипт `mc.yandex.ru` не подгружается. Цели, которые отправляет сайт:
`quote-open`, `quote-submit`, `price-download`, `product-view`, `search-submit`.

### SEO / canonical-домен

`SITE_URL` (для Node-скриптов) и `VITE_SITE_URL` (для сборки фронта) должны
совпадать. Подставляются в:
- `public/sitemap.xml` / `public/robots.txt` (генерация после импорта прайса);
- `<link rel="canonical">`, `og:url`, JSON-LD (`Product.url`, `Organization.url`).

## Структура

```
src/
  app/router.jsx           # маршруты (lazy-загрузка страниц)
  components/              # UI, layout, формы, каталог
  hooks/useSEO.js          # title, description, og:*, twitter, canonical
  hooks/useJsonLd.js       # вставка <script type="application/ld+json">
  lib/siteConfig.js        # NAP компании, базовый URL — единый источник правды
  lib/analytics.js         # Yandex.Metrika (no-op если id не задан)
  lib/quotePdf.js          # генератор КП в PDF (lazy + Roboto Cyrillic)
  pages/                   # все страницы (lazy через router.jsx)
  store/                   # zustand-сторы корзины и избранного (persist)
  styles/                  # глобальные + посекционные стили
scripts/
  importPrice.js           # чтение Excel → products.json + отчёты + SEO
  lib/siteSeo.js           # генератор sitemap.xml/robots.txt
data/
  products.json            # выход импортёра, читается сервером
  catalogCategories.json   # дерево категорий каталога
  productRegistry.json     # стабильные id/slug между импортами
public/
  sitemap.xml, robots.txt  # перезаписываются importPrice.js
server.js                  # Express + nodemailer
```

## Импорт прайса

```bash
node scripts/importPrice.js              # data/price.xls по умолчанию
node scripts/importPrice.js path.xls
node scripts/importPrice.js --dry-run    # только отчёт, без записи
```

После успешного запуска перезаписываются:
`data/products.json`, `data/import-report.{json,html}`, `data/import-history.json`,
`data/productRegistry.json`, `public/sitemap.xml`, `public/robots.txt`.

HTML-отчёт открывается прямо из консоли (выводится ссылка `file://...`).
