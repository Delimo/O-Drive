import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EXTENSIONS = new Set(['.js', '.mjs', '.css', '.html', '.json', '.md']);
const EXCLUDE_DIRS = new Set([
  'node_modules',
  '.git',
  '.wrangler',
  'coverage',
  'playwright-report',
  'test-results',
]);

function findFiles(dir, results = []) {
  const entries = readdirSync(dir);
  for (const entry of entries) {
    if (EXCLUDE_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      findFiles(full, results);
    } else if (EXTENSIONS.has(extname(entry))) {
      results.push(full);
    }
  }
  return results;
}

const files = findFiles(ROOT);
const failures = [];

for (const file of files) {
  const text = readFileSync(file, 'utf8');
  const lines = text.split('\n');
  lines.forEach((line, index) => {
    if (/[ \t]\r?$/.test(line)) failures.push(`${file}:${index + 1} trailing whitespace`);
  });
  if (text.length && !text.endsWith('\n')) failures.push(`${file}: missing final newline`);
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log(`Format check passed: ${files.length} files`);
