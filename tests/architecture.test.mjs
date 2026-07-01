import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function readProjectFile(path) {
  return readFileSync(join(ROOT, path), 'utf8');
}

function importedSpecifiers(source) {
  return [...source.matchAll(/import\s+(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/g)].map((match) => match[1]);
}

function listProjectFiles(path) {
  const absolute = join(ROOT, path);
  return readdirSync(absolute).flatMap((entry) => {
    const child = join(path, entry);
    const childAbsolute = join(ROOT, child);
    return statSync(childAbsolute).isDirectory() ? listProjectFiles(child) : [child.replace(/\\/g, '/')];
  });
}

test('entry file keeps app assembly inside approved frontend layers', () => {
  const source = readProjectFile('public/index.js');
  const imports = importedSpecifiers(source).filter((specifier) => specifier.startsWith('.'));
  const allowedPrefixes = [
    './js/api/',
    './js/services/',
    './js/state/',
    './js/render/',
    './js/events/',
    './js/utils/',
    './js/ui/',
    './js/vendor/',
  ];
  const allowedExact = new Set(['./js/constants.js']);

  assert.deepEqual(
    imports.filter((specifier) => !allowedExact.has(specifier) && !allowedPrefixes.some((prefix) => specifier.startsWith(prefix))),
    [],
  );
  assert.equal(imports.some((specifier) => specifier.startsWith('./js/render/pages/admin/')), false);
  assert.match(source, /createRootStore/);
  assert.match(source, /createPageRenderers/);
  assert.match(source, /registerAppEvents/);
});

test('admin page tabs stay wired through modular renderers', () => {
  const source = readProjectFile('public/js/render/pages/index.js');
  const tabIds = [...source.matchAll(/\{\s*id:\s*"([^"]+)"/g)].map((match) => match[1]);
  const switchCases = [...source.matchAll(/case\s+"([^"]+)":/g)].map((match) => match[1]);

  assert.ok(tabIds.length > 0);
  assert.deepEqual(switchCases.sort(), tabIds.sort());
  for (const moduleName of ['overview', 'logs', 'storage', 'shares', 'system', 'webhook']) {
    assert.ok(
      source.includes(`./admin/${moduleName}.js`),
      `admin renderer should import ./admin/${moduleName}.js`,
    );
    assert.equal(existsSync(join(ROOT, `public/js/render/pages/admin/${moduleName}.js`)), true);
  }
});

test('css build keeps generated files derived from source stylesheets', () => {
  const packageJson = JSON.parse(readProjectFile('package.json'));
  const build = packageJson.scripts?.build || '';
  const stylePairs = [
    ['style.css', 'main.css'],
    ['style.explorer.css', 'explorer.css'],
    ['style.admin.css', 'admin.css'],
    ['style.share.css', 'share.css'],
  ];

  for (const [sourceFile, outputFile] of stylePairs) {
    assert.equal(existsSync(join(ROOT, `public/${sourceFile}`)), true);
    assert.equal(existsSync(join(ROOT, `public/${outputFile}`)), true);
    assert.match(build, new RegExp(`tailwindcss -i ./public/${sourceFile} -o ./public/${outputFile}`));
  }
  assert.match(build, /ensure-final-newline\.mjs \.\/public\/main\.css \.\/public\/explorer\.css \.\/public\/admin\.css \.\/public\/share\.css/);
});

test('new renderer dropdowns use the optimized custom select by default', () => {
  const renderFiles = listProjectFiles('public/js/render').filter((file) => file.endsWith('.js'));
  const rawSelects = [];

  for (const file of renderFiles) {
    const source = readProjectFile(file);
    for (const match of source.matchAll(/<select\b[^>]*>/g)) {
      const tag = match[0];
      rawSelects.push(`${file}: ${tag}`);
    }
  }

  assert.deepEqual(
    rawSelects,
    [],
    'Use renderCustomSelect/cselect for new dropdowns, or add a deliberate exception here.',
  );
});
