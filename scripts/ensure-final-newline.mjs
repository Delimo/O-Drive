import { readFileSync, writeFileSync } from 'node:fs';

for (const file of process.argv.slice(2)) {
  const text = readFileSync(file, 'utf8');
  if (text.length && !text.endsWith('\n')) {
    writeFileSync(file, `${text}\n`);
  }
}
