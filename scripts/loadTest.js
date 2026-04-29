import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

const apiBase = process.env.API_BASE || 'http://127.0.0.1:3001';
const staticBase = process.env.STATIC_BASE || '';
const rootDir = process.env.ROOT_DIR || process.cwd();
const durationSec = readNumberEnv('LOAD_DURATION_SEC', 30, { min: 1 });
const timeoutMs = readNumberEnv('LOAD_TIMEOUT_MS', 10_000, { min: 100 });
const concurrencies = readListEnv('LOAD_CONCURRENCY', '10,25,50,100');

const productSlugs = [
  'avbbshv-4h50-1',
  'avbbshv-4h70-2',
  'avbbshv-4h95-3',
  'avbshv-3h10-g',
  'pmsv-2h1-2-ots-47r',
  'pugv-1h1-5-krasn-3yr',
];
const searches = ['кабель', 'ВВГ', 'ПУГВ', 'нг', 'СИП', 'КВВГ'];
const categories = [
  'silovoy-kabel',
  'kontrolnyy-kabel',
  'provoda',
  'nekabelnaya-produkciya',
];

function readNumberEnv(
  name,
  fallback,
  { min = -Infinity, max = Infinity } = {}
) {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(value, min), max);
}

function readListEnv(name, fallback) {
  return String(process.env[name] || fallback)
    .split(',')
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item) && item > 0);
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, index))];
}

function pick(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function apiScenario() {
  const page = 1 + Math.floor(Math.random() * 40);
  const search = encodeURIComponent(pick(searches));
  const category = pick(categories);
  const slug = pick(productSlugs);
  const weighted = [
    { weight: 5, name: 'health', method: 'GET', url: `${apiBase}/api/health` },
    {
      weight: 22,
      name: 'products-page',
      method: 'GET',
      url: `${apiBase}/api/products?limit=20&page=${page}`,
    },
    {
      weight: 18,
      name: 'products-filtered',
      method: 'GET',
      url: `${apiBase}/api/products?category=${category}&limit=60&page=1&sort=popular`,
    },
    {
      weight: 16,
      name: 'products-search',
      method: 'GET',
      url: `${apiBase}/api/products?search=${search}&limit=20&page=1`,
    },
    {
      weight: 12,
      name: 'suggestions',
      method: 'GET',
      url: `${apiBase}/api/products/suggestions?search=${search}&limit=10`,
    },
    {
      weight: 10,
      name: 'featured',
      method: 'GET',
      url: `${apiBase}/api/products/featured?limit=10`,
    },
    {
      weight: 10,
      name: 'product-detail',
      method: 'GET',
      url: `${apiBase}/api/products/${slug}`,
    },
    {
      weight: 7,
      name: 'lookup',
      method: 'POST',
      url: `${apiBase}/api/products/lookup`,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ids: [1, 2, 3, 124, 390, 5463] }),
    },
  ];

  return weightedPick(weighted);
}

function listStaticAssets() {
  if (!staticBase) return [];

  const assetsDir = path.join(rootDir, 'dist', 'assets');
  try {
    return fs
      .readdirSync(assetsDir)
      .filter((file) => /\.(js|css)$/.test(file))
      .sort((a, b) => {
        const aSize = fs.statSync(path.join(assetsDir, a)).size;
        const bSize = fs.statSync(path.join(assetsDir, b)).size;
        return bSize - aSize;
      })
      .slice(0, 8)
      .map((file) => `/assets/${file}`);
  } catch {
    return [];
  }
}

function staticScenarioFactory() {
  const staticAssets = listStaticAssets();

  return () => {
    const slug = pick(productSlugs);
    const pages = [
      '/',
      '/catalog',
      '/contacts',
      '/delivery',
      '/payment',
      `/product/${slug}`,
    ];
    return weightedPick([
      ...pages.map((pageUrl) => ({
        weight: 10,
        name: `page:${pageUrl}`,
        method: 'GET',
        url: `${staticBase}${pageUrl}`,
      })),
      ...staticAssets.map((asset) => ({
        weight: 5,
        name: `asset:${asset}`,
        method: 'GET',
        url: `${staticBase}${asset}`,
      })),
    ]);
  };
}

function weightedPick(items) {
  let roll = Math.random() * items.reduce((sum, item) => sum + item.weight, 0);
  for (const item of items) {
    roll -= item.weight;
    if (roll <= 0) return item;
  }
  return items.at(-1);
}

async function runRequest(scenario) {
  const request = scenario();
  const started = performance.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      signal: controller.signal,
    });
    await response.arrayBuffer();
    return {
      ok: response.status >= 200 && response.status < 500,
      status: response.status,
      name: request.name,
      duration: performance.now() - started,
    };
  } catch (error) {
    return {
      ok: false,
      status: error.name || 'ERR',
      name: request.name,
      duration: performance.now() - started,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function runStage({ label, scenario, concurrency }) {
  const endAt = performance.now() + durationSec * 1000;
  const results = [];

  async function worker() {
    while (performance.now() < endAt) {
      results.push(await runRequest(scenario));
    }
  }

  const started = performance.now();
  await Promise.all(Array.from({ length: concurrency }, worker));
  const elapsedSec = (performance.now() - started) / 1000;
  const durations = results.map((item) => item.duration).sort((a, b) => a - b);
  const statuses = new Map();
  const byName = new Map();
  let errors = 0;

  for (const item of results) {
    statuses.set(item.status, (statuses.get(item.status) || 0) + 1);
    if (!item.ok || item.status >= 400) errors += 1;

    const stat = byName.get(item.name) || { count: 0, total: 0, max: 0 };
    stat.count += 1;
    stat.total += item.duration;
    stat.max = Math.max(stat.max, item.duration);
    byName.set(item.name, stat);
  }

  return {
    label,
    concurrency,
    durationSec: Number(elapsedSec.toFixed(2)),
    requests: results.length,
    rps: Number((results.length / elapsedSec).toFixed(1)),
    errors,
    errorRate: Number(
      ((errors / Math.max(1, results.length)) * 100).toFixed(2)
    ),
    p50Ms: Number(percentile(durations, 50).toFixed(1)),
    p95Ms: Number(percentile(durations, 95).toFixed(1)),
    p99Ms: Number(percentile(durations, 99).toFixed(1)),
    maxMs: Number((durations.at(-1) || 0).toFixed(1)),
    statuses: Object.fromEntries([...statuses.entries()].sort()),
    slowest: [...byName.entries()]
      .map(([name, stat]) => ({
        name,
        count: stat.count,
        avgMs: Number((stat.total / stat.count).toFixed(1)),
        maxMs: Number(stat.max.toFixed(1)),
      }))
      .sort((a, b) => b.avgMs - a.avgMs)
      .slice(0, 5),
  };
}

async function main() {
  const profiles = [{ label: 'api', scenario: apiScenario }];
  if (staticBase) {
    profiles.push({ label: 'static', scenario: staticScenarioFactory() });
  }

  const summary = [];
  for (const profile of profiles) {
    for (const concurrency of concurrencies) {
      const result = await runStage({ ...profile, concurrency });
      summary.push(result);
      console.log(JSON.stringify(result));
    }
  }

  console.log(JSON.stringify({ summary }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
