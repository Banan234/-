import fs from 'fs/promises';
import path from 'path';
import { gzip, brotliCompress, constants as zlibConstants } from 'zlib';
import { promisify } from 'util';

const gzipAsync = promisify(gzip);
const brotliCompressAsync = promisify(brotliCompress);
const distDir = path.resolve(process.cwd(), 'dist');
const COMPRESSIBLE_EXTENSIONS = new Set([
  '.css',
  '.html',
  '.js',
  '.json',
  '.map',
  '.svg',
  '.txt',
  '.webmanifest',
  '.xml',
]);
const MIN_SIZE_BYTES = 1024;
const GZIP_LEVEL = 6;
export const BROTLI_QUALITY = 11;

function isBuildTimeProductPage(filePath, outputDir) {
  const relativePath = path.relative(outputDir, filePath);
  const parts = relativePath.split(path.sep);
  return (
    parts.length === 2 && parts[0] === 'product' && parts[1].endsWith('.html')
  );
}

async function collectFiles(dir, { outputDir }) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const filePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(filePath, { outputDir })));
      continue;
    }
    if (!entry.isFile()) continue;
    if (filePath.endsWith('.br') || filePath.endsWith('.gz')) continue;
    if (!COMPRESSIBLE_EXTENSIONS.has(path.extname(entry.name))) continue;
    if (isBuildTimeProductPage(filePath, outputDir)) continue;
    files.push(filePath);
  }

  return files;
}

async function precompressFile(filePath) {
  const input = await fs.readFile(filePath);
  if (input.length < MIN_SIZE_BYTES) return false;

  const [gzipped, brotlied] = await Promise.all([
    gzipAsync(input, { level: GZIP_LEVEL }),
    brotliCompressAsync(input, {
      params: {
        [zlibConstants.BROTLI_PARAM_QUALITY]: BROTLI_QUALITY,
      },
    }),
  ]);

  await Promise.all([
    fs.writeFile(`${filePath}.gz`, gzipped),
    fs.writeFile(`${filePath}.br`, brotlied),
  ]);

  return true;
}

export async function precompress({
  outputDir = distDir,
  log = console.log,
} = {}) {
  const files = await collectFiles(outputDir, { outputDir });
  let written = 0;

  for (const filePath of files) {
    if (await precompressFile(filePath)) {
      written += 1;
    }
  }

  log?.(`[precompress] wrote .br/.gz for ${written}/${files.length} files`);
  return written;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  precompress().catch((error) => {
    console.error('[precompress] failed:', error);
    process.exit(1);
  });
}
