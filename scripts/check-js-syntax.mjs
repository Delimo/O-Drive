import { execFileSync } from 'node:child_process';

const files = execFileSync('rg', ['--files', '-g', '*.js', '-g', '*.mjs'], { encoding: 'utf8' })
  .split(/\r?\n/)
  .filter(Boolean);

for (const file of files) {
  execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });
}

console.log(`JS syntax check passed: ${files.length} files`);
