import { access, mkdir, mkdtemp, rm, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BROTLI_QUALITY, precompress } from './precompress.js';

const tempDirs = [];

async function makeTempDir() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'yuzhural-precompress-'));
  tempDirs.push(dir);
  return dir;
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  );
});

describe('precompress', () => {
  it('uses max brotli quality for build-time compression', () => {
    expect(BROTLI_QUALITY).toBe(11);
  });

  it('skips build-time product pages to keep deploy image smaller', async () => {
    const outputDir = await makeTempDir();
    const productDir = path.join(outputDir, 'product');
    await mkdir(productDir, { recursive: true });

    const repeatedHtml = `<html><body>${'content '.repeat(300)}</body></html>`;
    const indexPath = path.join(outputDir, 'index.html');
    const productPath = path.join(productDir, 'sample-product.html');
    await writeFile(indexPath, repeatedHtml, 'utf8');
    await writeFile(productPath, repeatedHtml, 'utf8');

    const written = await precompress({ outputDir, log: vi.fn() });

    expect(written).toBe(1);
    expect(await exists(`${indexPath}.br`)).toBe(true);
    expect(await exists(`${indexPath}.gz`)).toBe(true);
    expect(await exists(`${productPath}.br`)).toBe(false);
    expect(await exists(`${productPath}.gz`)).toBe(false);
  });
});
