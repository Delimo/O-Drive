# O-Drive

一个部署在 Cloudflare Pages 上的文件管理项目。

## 功能

- 游客浏览
- 管理员登录
- 文件预览与下载
- 上传、新建、重命名、删除、移动、复制
- 隐藏路径管理

## 部署

### 1. Cloudflare Pages

- Build command: `npm run build`
- Build output directory: `public`
- Functions directory: `functions`

### 2. 绑定

- `DB`：Cloudflare D1
- `R2_BUCKET`：Cloudflare R2

### 3. 环境变量

- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`
- `ALLOW_GUEST`：可选，不填或设为 `true` 时允许游客浏览

## 本地构建

```bash
npm install
npm run build
```

## 测试

```bash
npm test
```

## 目录

- `/index.html`：前台页面
- `/admin.html`：后台页面
- `/public`：静态资源
- `/functions`：Cloudflare Pages Functions

## 说明

- 下载与预览支持 `Range`
- 网站输出目录是 `public`
