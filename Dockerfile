# syntax=docker/dockerfile:1.7

# ---------- 1. Зависимости (всё, включая dev) ----------
# Отдельный слой ускоряет повторные сборки: при правке кода без изменения
# package*.json npm ci не перезапускается.
FROM node:20-slim AS deps
USER node
WORKDIR /home/node
RUN mkdir -p app
WORKDIR /home/node/app
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci

# ---------- 2. Сборка фронта (vite → dist/) + prerender SEO ----------
# build:prod = vite build && scripts/prerender.js. Prerender пишет
# dist/product/<slug>.html для каждой карточки + статика главной/
# каталога/контактов. Требует data/products.json в build-контексте.
FROM node:20-slim AS build
USER node
WORKDIR /home/node
RUN mkdir -p app
WORKDIR /home/node/app
ARG SITE_URL=https://yuzhuralelectrokabel.ru
ARG VITE_SITE_URL=https://yuzhuralelectrokabel.ru
ARG VITE_YANDEX_METRIKA_ID=
ARG VITE_SENTRY_DSN=
ARG VITE_SENTRY_ENVIRONMENT=production
ARG VITE_SENTRY_RELEASE=
ARG VITE_SENTRY_TRACES_SAMPLE_RATE=0
ENV SITE_URL=$SITE_URL \
    VITE_SITE_URL=$VITE_SITE_URL \
    VITE_YANDEX_METRIKA_ID=$VITE_YANDEX_METRIKA_ID \
    VITE_SENTRY_DSN=$VITE_SENTRY_DSN \
    VITE_SENTRY_ENVIRONMENT=$VITE_SENTRY_ENVIRONMENT \
    VITE_SENTRY_RELEASE=$VITE_SENTRY_RELEASE \
    VITE_SENTRY_TRACES_SAMPLE_RATE=$VITE_SENTRY_TRACES_SAMPLE_RATE
COPY --chown=node:node --from=deps /home/node/app/node_modules ./node_modules
COPY --chown=node:node . .
RUN npm run build:prod

# ---------- 3. Production-зависимости (без vitest/eslint/prettier) ----------
FROM node:20-slim AS prod-deps
USER node
WORKDIR /home/node
RUN mkdir -p app
WORKDIR /home/node/app
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# ---------- 4. Runtime для Express API ----------
# Финальный образ — slim + только то, что нужно node server.js в проде.
FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3001

# curl нужен для HEALTHCHECK; ставим минимально и чистим apt-кэш.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY --from=prod-deps /home/node/app/node_modules ./node_modules
COPY server.js ./
COPY --from=build /home/node/app/dist/index.html ./dist/index.html
COPY lib ./lib
COPY shared ./shared
COPY data ./data
COPY scripts ./scripts

# Не root. Базовый образ node предоставляет пользователя `node` (uid 1000).
RUN chown -R node:node /app
USER node

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -fsS http://127.0.0.1:3001/api/health || exit 1

CMD ["node", "server.js"]

# ---------- 5. Brotli-модули под точную версию nginx из web-образа ----------
FROM nginx:1.27-alpine AS brotli-builder
RUN apk add --no-cache --virtual .brotli-build-deps \
    build-base \
    curl \
    git \
    linux-headers \
    openssl-dev \
    pcre2-dev \
    zlib-dev
WORKDIR /tmp
RUN set -eux; \
    NGINX_VERSION="$(nginx -v 2>&1 | sed -E 's#nginx version: nginx/##')"; \
    curl -fsSL -o nginx.tar.gz "https://nginx.org/download/nginx-${NGINX_VERSION}.tar.gz"; \
    tar -zxf nginx.tar.gz; \
    git clone --recursive --depth=1 https://github.com/google/ngx_brotli.git; \
    cd "nginx-${NGINX_VERSION}"; \
    ./configure --with-compat --add-dynamic-module=/tmp/ngx_brotli; \
    make modules; \
    mkdir -p /tmp/brotli-modules; \
    cp objs/ngx_http_brotli_filter_module.so objs/ngx_http_brotli_static_module.so /tmp/brotli-modules/

# ---------- 6. Nginx со статикой и прокси на API ----------
FROM nginx:1.27-alpine AS web
RUN apk add --no-cache curl
COPY --from=brotli-builder /tmp/brotli-modules/ /etc/nginx/modules/
RUN { \
      echo 'load_module modules/ngx_http_brotli_filter_module.so;'; \
      echo 'load_module modules/ngx_http_brotli_static_module.so;'; \
      cat /etc/nginx/nginx.conf; \
    } > /tmp/nginx.conf \
    && mv /tmp/nginx.conf /etc/nginx/nginx.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /home/node/app/dist /usr/share/nginx/html
RUN mkdir -p /usr/share/nginx/runtime-data/public \
    && cp -f /usr/share/nginx/html/redirects.nginx.conf /usr/share/nginx/runtime-data/public/redirects.nginx.conf 2>/dev/null || true

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -fsS http://127.0.0.1/healthz || exit 1
