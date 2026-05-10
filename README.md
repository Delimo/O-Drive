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

## 目录结构

- `public/index.html`：前台页面骨架
- `public/admin.html`：后台页面骨架
- `public/js/api.js`：前端 API 入口
- `public/js/file-paths.js`：文件路径和 API URL 编码规则
- `public/js/file-view-model.js`：文件列表排序、选择等纯数据逻辑
- `public/js/ui.js`：前台 DOM 渲染
- `public/js/actions.js`：前台用户动作
- `functions/api/[[path]].js`：Cloudflare Pages Functions 路由入口
- `functions/api/lib/request-context.js`：请求路径、隐藏路径和权限边界
- `functions/api/lib/file-reads.js`：文件列表、搜索、预览、下载
- `functions/api/lib/file-mutations.js`：上传、删除、移动、复制、重命名、保存文本
- `tests/`：最小回归测试

## 维护约定

- 大的结构、功能、部署变更写入 `CHANGELOG.md`
- 小的样式微调、按钮对齐、文案修正不单独写入更新日志
- 文件路径拼接统一走 `public/js/file-paths.js`
- 文件列表排序和可选项计算统一走 `public/js/file-view-model.js`
- 后端权限和隐藏路径判断统一走 `functions/api/lib/request-context.js`

## 检查

```bash
npm test
```

## 下载与预览

- 预览和下载接口已支持 `Range`，适合大文件、视频和音频的分段读取。
- 浏览器会按需拉取部分内容，不必把整文件一次性读完。

## 运行方式

部署到 Pages 后，直接访问站点根路径即可。
后台使用 `/admin.html`。
