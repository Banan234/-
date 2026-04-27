import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC_DIR = join(process.cwd(), 'src');

function listJsxFiles(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    const stat = statSync(path);

    if (stat.isDirectory()) {
      return listJsxFiles(path);
    }

    return path.endsWith('.jsx') ? [path] : [];
  });
}

describe('image attributes', () => {
  it('keeps JSX images sized and explicitly scheduled for loading', () => {
    const failures = [];

    for (const filePath of listJsxFiles(SRC_DIR)) {
      const source = readFileSync(filePath, 'utf8');
      const images = source.matchAll(/<img\b[\s\S]*?\/>/g);

      for (const match of images) {
        const tag = match[0];
        const line = source.slice(0, match.index).split('\n').length;

        for (const attr of ['width', 'height', 'loading', 'decoding']) {
          if (!new RegExp(`\\b${attr}=`).test(tag)) {
            failures.push(`${filePath}:${line} missing ${attr}`);
          }
        }
      }
    }

    expect(failures).toEqual([]);
  });
});
