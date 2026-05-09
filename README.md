# O-Drive

Cloudflare Pages + Functions + R2 + D1 的文件管理项目。

## 入口

- `/index.html`：前台文件浏览
- `/admin.html`：管理后台

## 本地构建

```bash
npm install
npm run build
```

`build` 会生成 `public/main.css`。

## Cloudflare Pages 配置

- Build command: `npm run build`
- Build output directory: `public`
- Functions directory: `functions`

## 需要的绑定

- `DB`：Cloudflare D1
- `R2_BUCKET`：Cloudflare R2

## 环境变量

- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`
- `ALLOW_GUEST`：可选，不填或设为 `true` 时允许游客模式

## 运行方式

部署到 Pages 后，直接访问站点根路径即可。
后台使用 `/admin.html`。
