import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const files = execFileSync('rg', [
  '--files',
  '-g', '*.js',
  '-g', '*.mjs',
  '-g', '*.css',
  '-g', '*.html',
  '-g', '*.json',
  '-g', '*.md',
], { encoding: 'utf8' })
  .split(/\r?\n/)
  .filter(Boolean);

const failures = [];

for (const file of files) {
  const text = await readFile(file, 'utf8');
  const lines = text.split(/\n/);
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
