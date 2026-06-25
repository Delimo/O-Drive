# O-Drive WebDAV 功能实现计划

> 为管理员提供 WebDAV 接口，支持通过操作系统文件管理器（Windows 资源管理器、macOS Finder 等）直接管理 O-Drive 文件。

---

## 目录

1. [目标与范围](#1-目标与范围)
2. [架构设计](#2-架构设计)
3. [认证方案](#3-认证方案)
4. [WebDAV 方法实现](#4-webdav-方法实现)
5. [XML 处理](#5-xml-处理)
6. [文件清单](#6-文件清单)
7. [详细实现方案](#7-详细实现方案)
8. [环境变量与配置](#8-环境变量与配置)
9. [测试计划](#9-测试计划)
10. [已知限制](#10-已知限制)
11. [开发流程](#11-开发流程)

---

## 1. 目标与范围

### 目标

让管理员可以通过 WebDAV 客户端（Windows 资源管理器、macOS Finder、Cyberduck、rclone 等）挂载 O-Drive 为网络驱动器，直接进行文件的浏览、上传、下载、删除、移动、复制和新建文件夹操作。

### 范围

**只对管理员开放**，不支持游客访问。WebDAV 客户端不支持 Cookie 认证，需要新增 Basic Auth 通道。

### 核心能力

| 能力 | 说明 |
|------|------|
| 浏览目录 | 列出文件和文件夹，显示大小、修改时间 |
| 下载文件 | 支持 Range 请求（断点续传） |
| 上传文件 | 流式写入 R2，同步更新文件索引 |
| 删除文件/文件夹 | 软删除进回收站（与现有行为一致） |
| 新建文件夹 | 创建 `.folder` 哨兵对象 |
| 移动/重命名 | 移动 R2 对象 + 更新索引 |
| 复制 | 浅拷贝（Copy-on-Write，与现有行为一致） |

---

## 2. 架构设计

### 入口点

WebDAV 使用独立的 Pages Functions 入口，与现有 API 完全隔离：

```
functions/dav/[[path]].js    ← WebDAV 入口，处理 /dav/* 请求
functions/api/[[path]].js    ← 现有 API 入口，不变
```

**为什么独立入口？**
- WebDAV 使用特殊 HTTP 方法（PROPFIND、MKCOL、MOVE、COPY），不需要 CSRF 保护
- 认证方式不同（Basic Auth vs Cookie）
- 响应格式不同（XML vs JSON）
- 避免对现有 API 入口的侵入性修改

### 请求流程

```
客户端请求 /dav/*
  │
  ├─ OPTIONS → 返回 WebDAV 允许的方法（CORS 预检 + DAV compliance）
  │
  ├─ Basic Auth 验证
  │   ├─ 成功 → 继续
  │   └─ 失败 → 401 + WWW-Authenticate 头
  │
  ├─ 路径解析 → r2Key
  │
  ├─ 方法分发
  │   ├─ PROPFIND → 列出目录属性 / 获取文件属性
  │   ├─ GET/HEAD → 下载文件（支持 Range）
  │   ├─ PUT → 上传文件
  │   ├─ DELETE → 软删除
  │   ├─ MKCOL → 创建文件夹
  │   ├─ MOVE → 移动/重命名
  │   └─ COPY → 复制
  │
  └─ 返回 XML 响应（PROPFIND）或标准 HTTP 响应
```

### 与现有模块的复用

| 模块 | 复用方式 |
|------|---------|
| `storage.js` | 直接复用 `storageGet`、`storagePut`、`storageDelete`、`storageHead`、`storageList`、`storageCopy` |
| `file-index/` | 直接复用 `upsertFileIndex`、`deleteFileIndexKey`、`listIndexedDirectory`、`getFileIndexEntry` |
| `r2-tree.js` | 直接复用 `copyTree`（移动/复制） |
| `file-mutations/helpers.js` | 复用 `keyExists`、`assertTargetAvailable`、`normalizeUserKey` |
| `common/name.js` | 复用 `isReservedKey`、`RESERVED_PREFIXES` |
| `trash.js` | 复用 `softDeleteTree`（软删除进回收站） |
| `secrets.js` | 复用 `getTokenSecret` 用于签名 DAV Token |

---

## 3. 认证方案

### Basic Auth + DAV Token

WebDAV 客户端不支持 Cookie，使用 HTTP Basic Auth：

```
Authorization: Basic base64(username:token)
```

### 认证流程

1. 客户端发送 `Authorization: Basic <base64(username:token)>`
2. 服务端解码得到 `username` 和 `token`
3. 验证 `username === env.ADMIN_USERNAME`
4. 验证 `token` 是否与 `env.DAV_TOKEN` 匹配（timing-safe 比较）
5. 通过 → 继续处理；失败 → 返回 `401 + WWW-Authenticate: Basic realm="O-Drive WebDAV"`

### 为什么不用管理员密码？

- WebDAV 客户端会明文存储密码，使用独立的 DAV Token 更安全
- Token 可以独立轮换，不影响管理员登录
- Token 可以设置为空来禁用 WebDAV 功能

### 环境变量

```
DAV_TOKEN=<随机字符串>       # WebDAV 专用访问令牌，留空则禁用 WebDAV
```

### Token 生成方式

与 `TOKEN_SECRET` 类似，推荐 32 字节随机 base64url：

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

---

## 4. WebDAV 方法实现

### 4.1 OPTIONS

**用途：** 客户端探测服务器支持的 WebDAV 能力。

**响应头：**
```
Allow: OPTIONS, GET, HEAD, PUT, DELETE, MKCOL, MOVE, COPY, PROPFIND
DAV: 1
MS-Author-Via: DAV
```

**说明：** 只声明 DAV Level 1（不支持 LOCK/UNLOCK）。`MS-Author-Via: DAV` 让 Windows 资源管理器识别为 WebDAV 服务器。

---

### 4.2 PROPFIND

**用途：** 列出目录内容或获取文件/目录属性。这是 WebDAV 最核心的方法。

**请求头：**
- `Depth: 0` — 只返回当前资源自身
- `Depth: 1` — 返回当前资源 + 直接子项（最常用）

**请求体：** XML，指定需要的属性。客户端可能发送：
```xml
<?xml version="1.0" encoding="utf-8"?>
<D:propfind xmlns:D="DAV:">
  <D:allprop/>
</D:propfind>
```
或指定属性：
```xml
<D:propfind xmlns:D="DAV:">
  <D:prop>
    <D:displayname/>
    <D:getcontentlength/>
    <D:getlastmodified/>
    <D:resourcetype/>
    <D:getcontenttype/>
  </D:prop>
</D:propfind>
```

**响应：** XML multistatus 格式：
```xml
<?xml version="1.0" encoding="utf-8"?>
<D:multistatus xmlns:D="DAV:">
  <D:response>
    <D:href>/dav/photos/</D:href>
    <D:propstat>
      <D:prop>
        <D:displayname>photos</D:displayname>
        <D:getlastmodified>Fri, 25 Jun 2026 12:00:00 GMT</D:getlastmodified>
        <D:resourcetype><D:collection/></D:resourcetype>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>
  <D:response>
    <D:href>/dav/photos/cat.jpg</D:href>
    <D:propstat>
      <D:prop>
        <D:displayname>cat.jpg</D:displayname>
        <D:getcontentlength>123456</D:getcontentlength>
        <D:getlastmodified>Fri, 25 Jun 2026 12:00:00 GMT</D:getlastmodified>
        <D:resourcetype/>
        <D:getcontenttype>image/jpeg</D:getcontenttype>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>
</D:multistatus>
```

**实现逻辑：**

1. 解析请求体 XML（提取请求的属性名，或 `allprop`）
2. 根据 `Depth` 头决定返回范围
3. 路径为空（根目录）→ 返回根目录及其子项
4. 路径是文件 → 返回文件属性
5. 路径是目录 → 查询 D1 `listIndexedDirectory` + R2 `storageList`，合并结果
6. 生成 XML 响应

**支持的属性：**

| 属性 | 来源 | 说明 |
|------|------|------|
| `displayname` | `file_index.name` 或路径最后一段 | 文件/文件夹名 |
| `getcontentlength` | `file_index.size` | 文件大小（字节） |
| `getlastmodified` | `file_index.updated_at` | 最后修改时间（HTTP 日期格式） |
| `resourcetype` | `file_index.kind` | 文件夹返回 `<collection/>`，文件返回空 |
| `getcontenttype` | `file_index.content_type` | MIME 类型 |
| `creationdate` | `file_index.uploaded_at` | 创建时间（ISO 8601 格式） |

---

### 4.3 GET / HEAD

**用途：** 下载文件。

**实现：** 复用现有 `storageGet` + `resolveExistingObjectLocation`，支持 Range 请求。

**响应头：**
```
Content-Type: <mime>
Content-Length: <size>
Content-Disposition: inline; filename="<name>"
Accept-Ranges: bytes
```

**Range 支持：**
- 解析 `Range: bytes=0-499` 头
- 调用 `storageGet(env, "r2", key, { range: { offset, length } })`
- 返回 `206 Partial Content` + `Content-Range: bytes 0-499/123456`

---

### 4.4 PUT

**用途：** 上传文件。

**实现：**
1. 从路径提取目标 key
2. 检查存储配额 `checkStorageQuota`
3. 流式写入 R2：`storagePut(env, "r2", key, request.body, { httpMetadata })`
4. 更新 D1 文件索引：`upsertFileIndex`
5. 返回 `201 Created`（新文件）或 `204 No Content`（覆盖）

**注意：** 不使用 multipart upload，WebDAV 客户端期望单次 PUT 完成上传。Cloudflare Workers 支持流式 request body，大文件由 R2 接收。

---

### 4.5 DELETE

**用途：** 删除文件或文件夹。

**实现：** 复用 `softDeleteTree`，文件进入回收站而非永久删除。

**响应：** `204 No Content`

---

### 4.6 MKCOL

**用途：** 创建文件夹（MKCOL = Make Collection）。

**实现：** 复用 mkdir 逻辑：
1. 检查目标不存在
2. 创建 `.folder` 哨兵对象：`storagePut(env, "r2", key + "/.folder", new Uint8Array(0))`
3. 返回 `201 Created`

**响应：** `201 Created` 或 `405 Method Not Allowed`（目标已存在）

---

### 4.7 MOVE

**用途：** 移动/重命名文件或文件夹。

**实现：**
1. 从 `Destination` 头解析目标路径
2. 验证源存在，目标不存在（或 `Overwrite: T` 时先删除目标）
3. 复用 `copyTree(env, srcKey, destKey, true)` 执行移动
4. 返回 `201 Created`（新位置）或 `204 No Content`（覆盖）

**请求头：**
- `Destination: /dav/new-path/file.txt`
- `Overwrite: T` 或 `F`

---

### 4.8 COPY

**用途：** 复制文件或文件夹。

**实现：**
1. 从 `Destination` 头解析目标路径
2. 复用 `copyTree(env, srcKey, destKey, false)` 执行浅拷贝
3. 返回 `201 Created`

---

## 5. XML 处理

### 需求

WebDAV 协议大量使用 XML。需要两个能力：
1. **解析请求体 XML** — PROPFIND 请求指定需要的属性
2. **生成响应 XML** — PROPFIND 响应返回属性列表

### 实现方案

不引入第三方 XML 库，使用字符串模板生成 + 简单正则解析。

**原因：**
- Cloudflare Workers 环境没有原生 DOMParser
- WebDAV 请求体 XML 结构简单且固定
- 响应 XML 是我们完全控制的输出

### XML 解析（请求体）

PROPFIND 请求体只有两种模式：

```xml
<!-- 模式 1：请求所有属性 -->
<D:propfind xmlns:D="DAV:"><D:allprop/></D:propfind>

<!-- 模式 2：请求指定属性 -->
<D:propfind xmlns:D="DAV:">
  <D:prop><D:displayname/><D:getcontentlength/></D:prop>
</D:propfind>
```

用正则匹配：
- 检测 `<allprop` → 返回所有属性
- 提取 `<prop>` 内的标签名 → 只返回请求的属性

### XML 生成（响应体）

使用模板字面量生成，确保正确转义 XML 特殊字符（`<`, `>`, `&`, `"`, `'`）。

---

## 6. 文件清单

### 新增文件

| 文件 | 用途 |
|------|------|
| `functions/dav/[[path]].js` | WebDAV 入口，方法分发 |
| `functions/dav/lib/auth.js` | Basic Auth 认证 |
| `functions/dav/lib/xml.js` | XML 解析与生成 |
| `functions/dav/lib/propfind.js` | PROPFIND 处理 |
| `functions/dav/lib/methods.js` | GET/PUT/DELETE/MKCOL/MOVE/COPY 处理 |

### 修改文件

| 文件 | 修改内容 |
|------|---------|
| `.dev.vars.example` | 添加 `DAV_TOKEN` 说明 |
| `README.md` | 添加 WebDAV 使用说明 |

### 不修改的文件

| 文件 | 原因 |
|------|------|
| `functions/api/[[path]].js` | 现有 API 入口，不变 |
| `functions/api/lib/storage.js` | 直接复用，不变 |
| `functions/api/lib/file-index/` | 直接复用，不变 |
| `functions/api/lib/r2-tree.js` | 直接复用，不变 |
| `functions/api/lib/trash.js` | 直接复用，不变 |
| `functions/api/lib/auth.js` | WebDAV 使用独立认证，不变 |

---

## 7. 详细实现方案

### 7.1 `functions/dav/[[path]].js` — 入口

```js
export async function onRequest(context) {
  const { request, env } = context;
  const method = request.method;
  const url = new URL(request.url);
  const path = url.pathname; // e.g., /dav/photos/cat.jpg

  // 检查 DAV_TOKEN 是否配置
  if (!env.DAV_TOKEN) {
    return new Response("WebDAV not configured", { status: 404 });
  }

  // OPTIONS 不需要认证
  if (method === "OPTIONS") {
    return handleOptions();
  }

  // Basic Auth 认证
  const auth = verifyBasicAuth(request, env);
  if (!auth) {
    return new Response("Unauthorized", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="O-Drive WebDAV"' },
    });
  }

  // 解析 r2Key（去掉 /dav/ 前缀）
  const r2Key = decodeURIComponent(path.replace(/^\/dav\/?/, ""));

  // 方法分发
  switch (method) {
    case "PROPFIND": return await handlePropfind(env, request, r2Key);
    case "GET":
    case "HEAD":     return await handleGet(env, request, r2Key, method);
    case "PUT":      return await handlePut(env, request, r2Key);
    case "DELETE":   return await handleDelete(env, r2Key);
    case "MKCOL":    return await handleMkcol(env, r2Key);
    case "MOVE":     return await handleMove(env, request, r2Key);
    case "COPY":     return await handleCopy(env, request, r2Key);
    default:
      return new Response("Method Not Allowed", {
        status: 405,
        headers: { Allow: "OPTIONS, GET, HEAD, PUT, DELETE, MKCOL, MOVE, COPY, PROPFIND" },
      });
  }
}
```

### 7.2 `functions/dav/lib/auth.js` — Basic Auth

```js
import { timingSafeEqual } from "../../api/lib/common/crypto.js";

export function verifyBasicAuth(request, env) {
  const header = request.headers.get("Authorization");
  if (!header || !header.startsWith("Basic ")) return null;

  const decoded = atob(header.slice(6));
  const colonIndex = decoded.indexOf(":");
  if (colonIndex < 0) return null;

  const username = decoded.slice(0, colonIndex);
  const token = decoded.slice(colonIndex + 1);

  // 验证用户名
  if (username !== env.ADMIN_USERNAME) return null;

  // 验证 token（timing-safe）
  if (!timingSafeCompare(token, env.DAV_TOKEN)) return null;

  return { role: "admin" };
}
```

### 7.3 `functions/dav/lib/xml.js` — XML 工具

```js
// XML 特殊字符转义
export function escapeXml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// 生成 HTTP 日期格式（RFC 1123）
export function httpDate(timestamp) {
  return new Date(timestamp).toUTCString();
}

// 生成 ISO 8601 日期格式
export function isoDate(timestamp) {
  return new Date(timestamp).toISOString();
}

// 从 PROPFIND 请求体解析请求的属性
export function parsePropfindRequest(body) {
  if (!body) return { allprop: true, props: [] };
  if (/<allprop/i.test(body)) return { allprop: true, props: [] };

  const props = [];
  const regex = /<D:(\w+)\s*\/?>/gi;
  let match;
  while ((match = regex.exec(body)) !== null) {
    const name = match[1].toLowerCase();
    if (name !== "prop" && name !== "propfind") {
      props.push(name);
    }
  }
  return { allprop: false, props };
}

// 生成 PROPFIND 响应 XML
export function buildMultistatus(items) {
  const responses = items.map(item => `
  <D:response>
    <D:href>${escapeXml(item.href)}</D:href>
    <D:propstat>
      <D:prop>
${item.props.map(p => `        ${p}`).join("\n")}
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>`).join("");

  return `<?xml version="1.0" encoding="utf-8"?>
<D:multistatus xmlns:D="DAV:">${responses}
</D:multistatus>`;
}
```

### 7.4 `functions/dav/lib/propfind.js` — PROPFIND 处理

核心逻辑：
1. 解析请求的属性
2. 根据 Depth 决定返回范围
3. 查询目录内容（复用 `listIndexedDirectory` + `storageList`）
4. 生成 XML 响应

### 7.5 `functions/dav/lib/methods.js` — 其他方法

GET/PUT/DELETE/MKCOL/MOVE/COPY 的实现，复用现有 storage 和 file-index 模块。

---

## 8. 环境变量与配置

### 新增环境变量

| 变量名 | 必填 | 说明 |
|--------|------|------|
| `DAV_TOKEN` | 否 | WebDAV 访问令牌。留空则禁用 WebDAV 功能 |

### `.dev.vars.example` 更新

```bash
# WebDAV (optional)
DAV_TOKEN=
```

### Cloudflare Pages 配置

在 Pages 项目的 `Settings` → `Environment variables` 中添加 `DAV_TOKEN`。

---

## 9. 测试计划

### 手动测试

1. **Windows 资源管理器**
   - 映射网络驱动器 `https://your-domain/dav/`
   - 浏览目录、上传文件、下载文件、删除文件、新建文件夹、移动/重命名

2. **macOS Finder**
   - 连接服务器 `https://your-domain/dav/`
   - 同上操作

3. **Cyberduck / rclone**
   - 配置 WebDAV 连接
   - 测试所有操作

### 单元测试

在 `tests/` 目录下新增 `webdav.test.mjs`：
- Basic Auth 验证（正确/错误凭证）
- XML 解析（allprop / 指定属性）
- XML 生成（目录列表 / 文件属性）
- 路径解析（根目录 / 子目录 / 文件）

### 边界情况

- 空目录的 PROPFIND
- 大文件上传（流式传输）
- 中文文件名（URL 编码）
- 保留前缀（.trash, .thumbs 等）的访问拒绝
- DAV_TOKEN 未配置时返回 404

---

## 10. 已知限制

| 限制 | 说明 | 影响 |
|------|------|------|
| DAV Level 1 only | 不支持 LOCK/UNLOCK | 多人同时编辑同一文件可能冲突，但管理员单人使用场景影响不大 |
| 无 multipart upload | WebDAV PUT 是单次请求 | Cloudflare Workers 支持流式 body，R2 可以接收大文件，但受限于 Workers 的请求体限制（免费版 100MB，付费版更大） |
| 无 PROPPATCH | 不支持修改自定义属性 | 文件元数据只能通过 Web 界面管理 |
| 文件大小限制 | 受 Workers/Pages 请求体限制 | 免费版 100MB，付费版 500MB+。超大文件建议使用 Web 界面的分片上传 |
| 软删除 | DELETE 进回收站而非永久删除 | 与 Web 界面行为一致，回收站需要定期清理 |
| 目录大小 | PROPFIND 响应包含目录所有子项 | 超大目录（>10000 文件）响应可能较慢 |

---

## 11. 开发流程

### Phase 1：基础框架

1. 创建 `functions/dav/[[path]].js` 入口
2. 实现 Basic Auth 认证
3. 实现 OPTIONS 方法
4. 测试：客户端能识别 WebDAV 服务器

### Phase 2：PROPFIND

5. 实现 XML 解析和生成
6. 实现 PROPFIND（Depth: 0 和 Depth: 1）
7. 测试：客户端能浏览目录

### Phase 3：文件操作

8. 实现 GET（下载，含 Range 支持）
9. 实现 PUT（上传）
10. 实现 DELETE（软删除）
11. 实现 MKCOL（新建文件夹）
12. 测试：客户端能上传/下载/删除/新建

### Phase 4：移动与复制

13. 实现 MOVE（移动/重命名）
14. 实现 COPY（复制）
15. 测试：客户端能移动/复制文件

### Phase 5：文档与收尾

16. 更新 `.dev.vars.example`
17. 更新 `README.md` 添加 WebDAV 使用说明
18. 在管理后台系统状态页添加 WebDAV 状态检查（可选）
19. 端到端测试（Windows / macOS / Cyberduck）
