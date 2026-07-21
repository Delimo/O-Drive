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

test('literal renderer actions stay wired to event handlers', () => {
  const publicFiles = listProjectFiles('public').filter((file) => /\.(js|html)$/.test(file));
  const eventSource = listProjectFiles('public/js/events')
    .filter((file) => file.endsWith('.js'))
    .map(readProjectFile)
    .join('\n');

  function collectLiteralAttributes(attribute) {
    const values = new Map();
    const pattern = new RegExp(`${attribute}=([\"'])([A-Za-z0-9_-]+)\\1`, 'g');
    for (const file of publicFiles) {
      const source = readProjectFile(file);
      for (const match of source.matchAll(pattern)) {
        if (!values.has(match[2])) values.set(match[2], new Set());
        values.get(match[2]).add(file);
      }
    }
    return values;
  }

  function collectHandled(comparisonName) {
    return new Set(
      [...eventSource.matchAll(new RegExp(`${comparisonName}\\s*===\\s*[\"']([^\"']+)[\"']`, 'g'))]
        .map((match) => match[1]),
    );
  }

  const actionIgnored = new Set([
    // Custom date picker footer buttons are handled inside bindCustomDatePickers.
    'clear',
    'today',
  ]);
  const checks = [
    ['data-action', collectHandled('action'), actionIgnored],
    ['data-action-input', collectHandled('actionInput'), new Set()],
    ['data-action-change', collectHandled('actionChange'), new Set()],
  ];

  for (const [attribute, handled, ignored] of checks) {
    const missing = [...collectLiteralAttributes(attribute).entries()]
      .filter(([value]) => !handled.has(value) && !ignored.has(value))
      .map(([value, files]) => `${value}: ${[...files].join(', ')}`)
      .sort();

    assert.deepEqual(missing, [], `${attribute} values should be handled`);
  }
});

// FE2 守护测试：render 层的模板插值中，形如 ${item.name}、${entry.path} 的
// 纯属性链表达式必须经过 escapeHtml 等安全包装，否则就是潜在的存储型 XSS。
// 该测试把"人工自觉转义"的约定升级为强制检查。
test('render templates escape raw data interpolations', () => {
  const renderFiles = listProjectFiles('public/js/render').filter((file) => file.endsWith('.js'));

  // 已知安全的属性后缀：数值、布尔或内部生成的受控值。
  const SAFE_TAIL = /(?:\.(?:length|size|rawSize|count|total|used|free|id|index|page|pages|status|level|width|height|top|left|percent|progress|ref_count|refCount|checked|disabled|open|kind|color|tint|downloadCount|maxDownloads|objectCount|totalChunks|completedParts|sizeFormatted|timeFormatted))$/;
  // 已知安全的链根：常量表、图标表等模块内部字典。
  const SAFE_ROOT = /^(?:icons|ICONS|labels|LABELS|classes|styles|config|CONSTANTS)\b/;

  // 逐条审阅过、确认安全的插值（值来自内部字典键、已转义的组合 HTML，
  // 或在下游 escapeHtml 渲染）。新增未转义插值不在此列会导致测试失败，
  // 促使维护者显式转义或在审阅后登记。
  const REVIEWED_SAFE = new Set([
    // renderMetaChip 内部已 escapeHtml，chips 是拼好的安全 HTML。
    'public/js/render/pages/admin/share-page.js: ${facts.chips}',
    // getPreviewKind 返回受控字典键（file/image/... 之一），用于 class 名。
    'public/js/render/pages/admin/share-page.js: ${preview.key}',
    // details 数组内容统一在渲染处用 escapeHtml 输出（system.js 内 details.map）。
    'public/js/render/pages/admin/system.js: ${result.outputKey}',
    'public/js/render/pages/admin/system.js: ${tsk.error}',
  ]);

  function extractInterpolations(source) {
    const results = [];
    for (let i = 0; i < source.length - 1; i++) {
      if (source[i] === '$' && source[i + 1] === '{') {
        let depth = 1;
        let j = i + 2;
        while (j < source.length && depth > 0) {
          if (source[j] === '{') depth++;
          else if (source[j] === '}') depth--;
          j++;
        }
        results.push(source.slice(i + 2, j - 1).trim());
        i = j - 1;
      }
    }
    return results;
  }

  const violations = [];
  for (const file of renderFiles) {
    const source = readProjectFile(file);
    for (const expr of extractInterpolations(source)) {
      // 只检查纯属性链（无函数调用、无运算符），如 item.name、row.remark。
      if (!/^[A-Za-z_$][\w$]*(?:\.[\w$]+|\?\.[\w$]+)+$/.test(expr)) continue;
      if (SAFE_TAIL.test(expr)) continue;
      if (SAFE_ROOT.test(expr)) continue;
      if (REVIEWED_SAFE.has(`${file}: \${${expr}}`)) continue;
      violations.push(`${file}: \${${expr}}`);
    }
  }

  assert.deepEqual(
    violations.sort(),
    [],
    'Wrap user-controllable data in escapeHtml(...) (or add the property to the safe list here with justification).',
  );
});

test('rendered markup does not use CSP-blocked inline event handlers', () => {
  const files = [
    ...listProjectFiles('public/js/render').filter((file) => file.endsWith('.js')),
    'public/index.js',
    'public/index.html',
    'public/admin.html',
    'public/share.html',
  ];
  const violations = [];
  for (const file of files) {
    const source = readProjectFile(file);
    if (/\son[a-z]+\s*=/i.test(source)) violations.push(file);
  }
  assert.deepEqual(violations, [], 'Use delegated events or CSS instead of inline event attributes.');
});

test('rendered images keep alt text and runtime normalizes button types', () => {
  const files = [
    ...listProjectFiles('public/js/render').filter((file) => file.endsWith('.js')),
    'public/index.js',
  ];
  const violations = [];
  for (const file of files) {
    const source = readProjectFile(file);
    for (const match of source.matchAll(/<img\b(?![^>]*\balt=)[^>]*>/gi)) {
      violations.push(`${file}: image missing alt`);
    }
  }
  assert.deepEqual(violations, []);
  assert.match(readProjectFile('public/index.js'), /button:not\(\[type\]\)/);
});

test('custom select Escape handling does not bubble into modal close', () => {
  const source = readProjectFile('public/js/render/pages/admin/components.js');
  const selectSource = source.slice(
    source.indexOf('function bindCustomSelects'),
    source.indexOf('function renderCustomDatePicker'),
  );
  const stops = selectSource.match(/event\.stopPropagation\(\);/g) || [];
  assert.equal(stops.length, 2);
  assert.match(selectSource, /event\.key === "Escape" && el\.classList\.contains\("cselect-open"\)/);
  assert.match(source, /panel\.addEventListener\("keydown"[\s\S]*event\.key === "Escape"[\s\S]*event\.stopPropagation\(\)/);
});
