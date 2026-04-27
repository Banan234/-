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

| Команда                                           | Что делает                                                                              |
| ------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `npm run dev`                                     | Vite + сервер, прокси /api/\*                                                           |
| `npm run build`                                   | Прод-сборка в `dist/`                                                                   |
| `npm run preview`                                 | Локальный smoke-тест прод-сборки                                                        |
| `npx vitest run`                                  | Тесты (39 кейсов)                                                                       |
| `npm run e2e`                                     | Playwright E2E smoke/user-flow тесты                                                    |
| `node scripts/importPrice.js [path/to/price.xls]` | Импорт прайса → `data/products.json`, отчёты, `public/sitemap.xml`, `public/robots.txt` |
| `node scripts/importPrice.js --dry-run`           | То же, но без записи файлов                                                             |

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
   SMTP_POOL=true
   SMTP_POOL_MAX_CONNECTIONS=2
   SMTP_CONNECTION_TIMEOUT_MS=10000
   SMTP_SOCKET_TIMEOUT_MS=20000
   SMTP_SEND_TIMEOUT_MS=25000
   SMTP_SEND_RETRIES=1
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

SMTP-транспорт создаётся один раз на Express app и по умолчанию работает через
pool: `SMTP_POOL=true`, `SMTP_POOL_MAX_CONNECTIONS=2`,
`SMTP_POOL_MAX_MESSAGES=100`. Handshake/socket ограничены таймаутами, а
`sendMail` дополнительно обёрнут в `SMTP_SEND_TIMEOUT_MS` и один retry
(`SMTP_SEND_RETRIES=1`) для временных сетевых ошибок и 4xx-ответов SMTP. Для
медленного провайдера лучше увеличить таймауты, чем оставлять их бесконечными.

### Reverse proxy

`TRUSTED_PROXY_IPS` задаёт, от каких proxy Express принимает
`X-Forwarded-For`. По умолчанию используется `loopback`, что подходит для
Nginx на той же машине. Если перед приложением стоят CDN или балансер,
укажите только их IP/CIDR через запятую, например:

```env
TRUSTED_PROXY_IPS=loopback,10.0.0.0/8,172.16.0.0/12
```

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

# Скачать свежий прайс с сайта поставщика и сразу пересобрать каталог:
PRICE_URL=https://kabelhome.ru/upload/price.xls npm run import:price:remote
node scripts/importPrice.js https://kabelhome.ru/upload/price.xls   # альтернатива
```

После успешного запуска перезаписываются:
`data/products.json`, `data/import-report.{json,html}`, `data/import-history.json`,
`data/productRegistry.json`, `public/sitemap.xml`, `public/robots.txt`.

HTML-отчёт открывается прямо из консоли (выводится ссылка `file://...`).

### Автоматический ежедневный импорт (production)

`data/products.json` лежит в `.gitignore` — после `npm ci` каталог пустой,
пока не запустится импортёр. На проде нужен один из двух подходов:

**Системный cron (рекомендуется).** Скачивает свежий прайс с сайта поставщика
каждый день в 04:30 утра по Москве:

```cron
30 4 * * * cd /var/www/yuzhural-site && /usr/bin/env PRICE_URL=https://kabelhome.ru/upload/price.xls /usr/bin/node scripts/importPrice.js >> /var/log/yuzhural-import.log 2>&1
```

Точный URL Excel-файла нужно подсмотреть на странице «Прайс / Скачать» сайта
поставщика (`kabelhome.ru`) и прописать в `PRICE_URL` (через `.env` либо
прямо в crontab).

**Если cron недоступен (shared hosting).** Скрипт `import:price:remote` можно
вызывать по расписанию из панели хостинга, systemd-таймера или
GitHub Actions schedule. Минимальный workflow:

```yaml
# .github/workflows/import-price.yml
on:
  schedule: [{ cron: '30 1 * * *' }] # 04:30 МСК
jobs:
  import:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: npm run import:price:remote
        env:
          PRICE_URL: ${{ secrets.PRICE_URL }}
      # дальше — деплой data/products.json и public/sitemap.xml на прод
```

В случае ошибки импортёр завершается с ненулевым кодом — и cron, и Actions
пришлют письмо/уведомление, ничего не теряется молча.

## Docker deploy, staging и rollback

Production compose использует immutable tag из `DEPLOY_TAG`. Не деплойте только
`:latest`: rollback должен переключать compose на уже собранный предыдущий tag,
а не пересобирать текущую рабочую директорию.

### Staging / preview

Staging изолирован от production: другие container names, порт, сеть и каталог
данных. По умолчанию сайт доступен на `http://localhost:8080`.

```bash
cp .env.example .env.staging
# В .env.staging задайте SMTP/QUOTE_TO_EMAIL, STAGING_SITE_URL и при необходимости
# STAGING_HTTP_PORT, STAGING_SENTRY_DSN.

mkdir -p data-staging
cp data/products.json data/productRegistry.json data-staging/

STAGING_DEPLOY_TAG=preview-$(git rev-parse --short HEAD) \
  docker compose -f docker-compose.staging.yml up -d --build

curl -fsS http://127.0.0.1:${STAGING_HTTP_PORT:-8080}/healthz
```

Если staging должен проверять свежий прайс отдельно от production, запускайте
импорт внутри staging-контейнера: `docker compose -f docker-compose.staging.yml exec app npm run import:price:remote`.

### Production release

```bash
export DEPLOY_TAG=$(date +%Y%m%d%H%M)-$(git rev-parse --short HEAD)
export VITE_SENTRY_RELEASE=$DEPLOY_TAG

docker compose build
docker compose up -d --no-build
docker compose ps
curl -fsS http://127.0.0.1/healthz
```

Перед деплоем убедитесь, что на хосте есть `./data/products.json`: этот каталог
смонтирован в `app` как `/app/data`, чтобы импорт прайса не терялся при
пересоздании контейнера.

### Rollback

Rollback — это переключение `DEPLOY_TAG` на предыдущий рабочий release tag без
`--build`.

```bash
export DEPLOY_TAG=<previous-good-tag>
export VITE_SENTRY_RELEASE=$DEPLOY_TAG

docker compose up -d --no-build
docker compose ps
curl -fsS http://127.0.0.1/healthz
```

Если образы хранятся в registry, перед `up` выполните `docker compose pull`.
Если предыдущего образа нет локально или в registry, `--no-build` специально
остановит rollback вместо того, чтобы случайно пересобрать новый образ.
