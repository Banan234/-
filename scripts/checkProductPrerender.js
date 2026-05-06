// Файл запускает production-проверку runtime HTML карточек товара относительно sitemap.

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { assertProductPrerenderCoverage } from './lib/productPrerenderAudit.js';
import { extractProductsPayload } from './prerender.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const productsPath = path.join(projectRoot, 'data', 'products.json');
const publicDir = path.resolve(
  projectRoot,
  process.env.PUBLIC_ARTIFACTS_DIR || 'public'
);

async function main() {
  const payload = JSON.parse(await fs.readFile(productsPath, 'utf8'));
  const products = extractProductsPayload(payload, { source: productsPath });
  const result = await assertProductPrerenderCoverage({
    publicDir,
    products,
  });

  const longTailInfo = result.longTailSlug
    ? `, long-tail sample=${result.longTailSlug}`
    : '';
  console.log(
    `Product prerender OK: sitemap URLs=${result.sitemapCount}, HTML=${result.htmlCount}${longTailInfo}`
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
