import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const EXTENSIONS = new Set(['.js', '.mjs']);
const EXCLUDE_DIRS = new Set(['node_modules', '.git', '.wrangler']);

function findFiles(dir, results = []) {
  const entries = readdirSync(dir);
  for (const entry of entries) {
    if (EXCLUDE_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      findFiles(full, results);
    } else if (EXTENSIONS.has(entry.slice(entry.lastIndexOf('.')))) {
      results.push(full);
    }
  }
  return results;
}

const files = findFiles(ROOT);

for (const file of files) {
  execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });
}

console.log(`JS syntax check passed: ${files.length} files`);
