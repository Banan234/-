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
async function resolvePublicArtifactsDir() {
  if (process.env.PUBLIC_ARTIFACTS_DIR) {
    return path.resolve(projectRoot, process.env.PUBLIC_ARTIFACTS_DIR);
  }

  const runtimePublicDir = path.join(projectRoot, 'data', 'public');
  try {
    await fs.access(runtimePublicDir);
    return runtimePublicDir;
  } catch {
    return path.join(projectRoot, 'public');
  }
}

async function main() {
  const publicDir = await resolvePublicArtifactsDir();
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
