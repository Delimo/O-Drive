// 构建时给 HTML 里的静态资源引用打内容版本号（?v=<hash>），
// 避免部署后浏览器拿到新 HTML + 旧 CSS/JS 的组合。
// 版本号取所有前端资源内容的联合 sha256 前 10 位，内容不变则版本不变。
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const publicDir = join(root, "public");

function collectJsFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectJsFiles(full));
    else if (entry.name.endsWith(".js")) out.push(full);
  }
  return out;
}

const files = [
  join(publicDir, "index.js"),
  join(publicDir, "main.css"),
  join(publicDir, "explorer.css"),
  join(publicDir, "admin.css"),
  join(publicDir, "share.css"),
  ...collectJsFiles(join(publicDir, "js")),
].sort();

const hash = createHash("sha256");
for (const file of files) {
  try {
    hash.update(file);
    hash.update(readFileSync(file));
  } catch (_) {}
}
const version = hash.digest("hex").slice(0, 10);

const ASSET_REF = /((?:href|src)=")(\/(?:main|explorer|admin|share)\.css|\/index\.js|\/js\/theme-init\.js)(?:\?v=[0-9a-f]+)?(")/g;

for (const name of ["index.html", "admin.html", "share.html"]) {
  const path = join(publicDir, name);
  const html = readFileSync(path, "utf8");
  const stamped = html.replace(ASSET_REF, `$1$2?v=${version}$3`);
  if (stamped !== html) {
    writeFileSync(path, stamped);
    console.log(`stamped ${name} -> v=${version}`);
  }
}
