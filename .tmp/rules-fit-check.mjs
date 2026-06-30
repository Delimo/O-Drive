import fs from 'node:fs';
import { chromium } from 'playwright';

const css = fs.readFileSync('public/admin.css', 'utf8');

const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    :root {
      --panel: #fff;
      --panel-soft: #f8fafc;
      --line: #e2e8f0;
      --line-strong: #cbd5e1;
      --text: #0f172a;
      --muted: #64748b;
      --accent: #0e7490;
    }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 24px; background: #f6f8fb; }
    .probe { width: 560px; border: 1px solid var(--line); background: var(--panel); overflow: hidden; }
    .probe .ov-rules-editor { height: 100%; }
    ${css}
  </style>
</head>
<body>
  <div class="probe">
    <div class="ov-rules-editor">
      <div class="ov-rules-editor-header">
        <div class="ov-rules-editor-title-row">
          <h3 class="ov-rules-editor-title">规则编辑</h3>
          <button class="btn btn-primary btn-sm" type="button">保存规则</button>
        </div>
        <p class="ov-rules-editor-desc">路径可以是目录，也可以是具体文件。</p>
      </div>
      <div class="ov-rules-editor-body">
        <div class="ov-rules-field">
          <label class="ov-rules-label">路径</label>
          <input class="input" type="text" placeholder="/客户资料/">
        </div>
        <div class="ov-rules-options">
          <label class="ov-rules-checkbox">
            <input type="checkbox">
            <span class="ov-rules-checkbox-label">
              <span class="ov-rules-checkbox-title">隐藏路径</span>
              <span class="ov-rules-checkbox-desc">从访客文件列表移除</span>
            </span>
          </label>
          <label class="ov-rules-checkbox">
            <input type="checkbox" checked>
            <span class="ov-rules-checkbox-label">
              <span class="ov-rules-checkbox-title">名称可见</span>
              <span class="ov-rules-checkbox-desc">受密码保护时仍显示名称</span>
            </span>
          </label>
        </div>
        <div class="ov-rules-inline-fields">
          <div class="ov-rules-field">
            <label class="ov-rules-label">访问密码</label>
            <input class="input" type="password" placeholder="至少 4 位，可不填">
          </div>
          <div class="ov-rules-field">
            <label class="ov-rules-label">备注</label>
            <input class="input" type="text" placeholder="可选">
          </div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
await page.setContent(html);

const results = [];
for (const height of [180, 200, 220, 240, 260, 280, 320]) {
  await page.locator('.probe').evaluate((el, h) => {
    el.style.height = `${h}px`;
  }, height);
  const metrics = await page.locator('.ov-rules-editor').evaluate((editor) => {
    const body = editor.querySelector('.ov-rules-editor-body');
    const last = body.lastElementChild;
    return {
      editorClientHeight: editor.clientHeight,
      editorScrollHeight: editor.scrollHeight,
      bodyClientHeight: body.clientHeight,
      bodyScrollHeight: body.scrollHeight,
      lastBottom: Math.round(last.getBoundingClientRect().bottom),
      editorBottom: Math.round(editor.getBoundingClientRect().bottom),
      fits: editor.scrollHeight <= editor.clientHeight && body.scrollHeight <= body.clientHeight,
    };
  });
  results.push({ height, ...metrics });
}

await page.screenshot({ path: '.tmp/rules-fit-check.png', fullPage: true });
console.log(JSON.stringify(results, null, 2));
await browser.close();
