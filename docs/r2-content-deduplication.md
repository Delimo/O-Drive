# R2 内容去重方案

> 本文档记录一个后续可实现的存储优化方案：让相同内容的文件在 Cloudflare R2 中只保存一份，用户侧仍保留各自的文件名、目录和展示记录。当前项目暂时无人使用，因此第一阶段只考虑新上传文件，不处理已有对象迁移。

## 目标

- 相同文件内容只占用一份 R2 存储空间。
- 用户看到的文件名、目录、分享、预览、下载体验不受影响。
- 重复上传同一内容时可以直接创建文件记录，减少 R2 写入，也为“秒传”能力打基础。
- 避免同名文件、不同名文件、并发上传等场景导致底层对象混淆。

## 非目标

- 暂不迁移已有 R2 文件。
- 暂不处理客户端加密后的跨用户去重。
- 暂不依赖 R2 `ETag` 作为内容一致性的最终依据。
- 暂不把用户目录结构直接映射为真实 R2 存储目录。

## 当前项目相关现状

O-Drive 当前后端基于 Cloudflare Pages Functions，文件相关逻辑主要位于：

- `functions/api/lib/file-mutations/upload.js`
- `functions/api/lib/file-mutations/multipart.js`
- `functions/api/lib/storage.js`
- `functions/api/lib/file-index/*`
- `functions/api/lib/trash.js`

当前 `file_index` 已经把“用户路径”和“底层对象 key”分开：

```sql
CREATE TABLE IF NOT EXISTS file_index (
  path TEXT PRIMARY KEY,
  storage_id TEXT NOT NULL DEFAULT 'r2',
  object_key TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  parent TEXT NOT NULL,
  kind TEXT NOT NULL,
  size INTEGER NOT NULL DEFAULT 0,
  content_type TEXT DEFAULT '',
  uploaded_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
```

这里可以继续沿用：

- `file_index.path`：用户看到和操作的逻辑路径，例如 `docs/a.pdf`。
- `file_index.object_key`：R2 中真实对象 key。去重后它不一定等于 `path`。
- `storage_usage`：按 `storage_id + object_key` 统计真实占用，天然适合去重后只统计一次。

## 核心模型

新增一张“真实对象表”，用于记录 R2 中实际保存的内容对象：

```sql
CREATE TABLE IF NOT EXISTS storage_objects (
  id TEXT PRIMARY KEY,
  storage_id TEXT NOT NULL DEFAULT 'r2',
  object_key TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  size INTEGER NOT NULL DEFAULT 0,
  content_type TEXT DEFAULT '',
  ref_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (storage_id, sha256, size),
  UNIQUE (storage_id, object_key)
);

CREATE INDEX IF NOT EXISTS idx_storage_objects_hash
  ON storage_objects(storage_id, sha256, size);
```

`file_index` 继续作为用户文件记录，不需要立刻重命名为 `files`。后续上传时：

```text
file_index.path       = 用户路径
file_index.object_key = storage_objects.object_key
storage_objects       = 真实 R2 对象元数据
```

## R2 存储位置

去重后的真实对象建议统一放到 R2 bucket 的固定前缀：

```text
objects/sha256/{前2位}/{第3-4位}/{完整sha256}
```

例子：

```text
objects/sha256/9f/2a/9f2a7c8b0e...
```

这个“文件夹”本质是 R2 object key 的前缀，不是传统文件系统目录。这样做的好处：

- 所有去重后的真实文件集中在 `objects/` 下。
- 不使用用户上传文件名，避免中文、重名、特殊字符和路径注入问题。
- hash 前缀分层后，R2 控制台中更容易浏览。
- `object_key` 可以和 `sha256` 互相校验。

用户目录仍然只存在数据库里，例如：

```text
用户看到: 合同.pdf
file_index.path: projects/合同.pdf
file_index.object_key: objects/sha256/9f/2a/9f2a...
storage_objects.sha256: 9f2a...
R2 object: objects/sha256/9f/2a/9f2a...
```

## 文件识别规则

判断两个文件是否相同，只看：

```text
sha256 + size
```

不使用：

- 文件名
- 用户目录
- R2 `ETag`
- MIME type
- 上传时间

同名文件不会被弄混：

```text
同名 + 内容相同   -> 复用同一个 storage_object
同名 + 内容不同   -> sha256 不同，创建不同 storage_object
不同名 + 内容相同 -> 复用同一个 storage_object，但保留各自 path/name
不同名 + 内容不同 -> 各自独立
```

`content_type` 只用于下载和预览响应，不参与去重判断。若同一内容被不同客户端以不同 MIME type 上传，可以采用“第一次写入为准”，或以后在 `file_index` 保留每个逻辑文件自己的 `content_type`。

## 普通上传流程

当前普通上传入口是 `handleUpload`。后续可以改成：

1. 从 `FormData` 获取 `file`。
2. 规范化用户目标路径，继续执行 `assertUserKey` 和冲突处理。
3. 计算文件 `SHA-256`。
4. 查询 `storage_objects` 是否存在同 `storage_id + sha256 + size` 的记录。
5. 如果存在：
   - 不再写入 R2。
   - 新增或更新 `file_index`，其中 `object_key = storage_objects.object_key`。
   - `storage_objects.ref_count + 1`。
   - 确保 `storage_usage` 中已有该 `object_key` 的真实大小。
6. 如果不存在：
   - 生成 `object_key = objects/sha256/...`。
   - 上传到 R2。
   - 写入 `storage_objects`，`ref_count = 1`。
   - 写入 `file_index`。
   - 写入 `storage_usage`。

需要注意：`File.stream()` 通常只能消费一次。计算 hash 和上传 R2 都要读取文件内容，普通上传可以考虑：

- 小文件：使用 `await file.arrayBuffer()`，先算 hash，再上传同一份 buffer。
- 大文件：走分片上传流程，不在普通上传里处理。
- 或新增一个支持 tee/缓存的 helper，但要谨慎控制内存。

## 大文件和分片上传

当前分片上传入口是 `multipart.js`：

- `handleMultipartCreate`
- `handleMultipartPart`
- `handleMultipartComplete`
- `handleMultipartAbort`

分片上传要做内容去重，会比普通上传复杂，因为 complete 之前后端不一定拥有完整文件内容。

建议第一阶段：

1. 普通上传先实现去重。
2. 分片上传暂时继续按旧逻辑写入用户路径，或要求前端在创建分片上传前提供 `sha256`。
3. 等普通上传稳定后，再扩展分片上传。

如果要支持分片秒传，推荐流程是：

```text
前端计算 sha256 + size
POST /api/upload/check
  存在 -> 直接创建 file_index，返回 success/skippedUpload
  不存在 -> 创建 multipart upload，上传完成后写 storage_objects
```

这样后端不需要在 multipart complete 后重新下载对象计算 hash。

## 下载、预览和读取

读取文件时不能再假设用户路径就是 R2 key。必须始终走：

```text
file_index.path -> file_index.object_key -> R2 get(object_key)
```

当前 `resolveExistingObjectLocation` 已经接近这个模型：

```text
path: 用户路径
storageId: indexed.storage_id
objectKey: indexed.object_key || indexed.path || key
```

后续需要检查所有下载、预览、压缩下载、WebDAV 读取等逻辑，确保它们使用 `resolveExistingObjectLocation` 或等价函数，而不是直接 `R2.get(path)`。

## 删除和回收站

去重后删除不能直接删除 R2 对象。逻辑删除用户文件时：

1. 删除或移动 `file_index.path` 对应的逻辑记录。
2. 找到对应 `storage_objects.object_key`。
3. `ref_count - 1`。
4. 只有当 `ref_count = 0`，且没有任何 `file_index` 继续引用该 `object_key` 时，才允许删除 R2 对象。

当前项目有回收站逻辑 `trash.js`，会把文件移动到 `.trash/`。去重方案下需要重新设计这里的语义：

- 推荐把回收站也视为一种逻辑引用。
- 用户删除到回收站时，不复制 R2 真实对象，只新增或保留一条 trash 记录指向同一个 `object_key`。
- 清空回收站时才减少 `ref_count`。
- 恢复时重新创建 `file_index.path`，继续指向原 `object_key`。

如果继续用“复制到 `.trash/` R2 key”的旧方式，会破坏去重收益，也会让引用计数变复杂。

## 配额和空间统计

当前 `storage_usage` 以 `storage_id + object_key` 为主键，适合统计真实物理占用。

去重后配额检查需要区分两种情况：

- 命中已有 `storage_object`：本次上传不增加真实 R2 占用，理论上不需要占用新的存储配额。
- 新建 `storage_object`：需要按文件大小检查剩余配额。

因此普通上传的顺序建议调整为：

```text
先计算 sha256
先查 storage_objects
命中已有对象 -> 跳过新增容量检查或按产品策略只检查逻辑数量
未命中 -> 检查 R2 真实容量配额，再上传
```

管理后台展示“已用空间”时，应继续基于 `storage_usage` 或 `storage_objects` 的真实对象大小求和，而不是简单累加 `file_index.size`。

## 并发安全

可能出现两个用户同时上传同一个新文件。需要依赖数据库唯一约束兜底：

```sql
UNIQUE (storage_id, sha256, size)
```

建议流程：

1. 两个请求都计算出相同 hash。
2. 都查询不到已有对象。
3. 都尝试写入 R2 同一个 hash key。
4. 都尝试插入 `storage_objects`。
5. 只有一个插入成功，另一个捕获唯一约束冲突后重新查询已有对象。
6. 两个请求分别写自己的 `file_index` 记录。

如果 R2 object key 由 hash 决定，即使并发写入同一 key，最终内容也是同一份内容。为了更严谨，后续可以先上传到临时 key，再完成 DB 事务后确认 canonical key，但第一阶段可以从简单方案开始。

## 一致性校验

为了降低长期维护风险，可以提供一个后续的管理检查任务：

- 扫描 `storage_objects`。
- 随机或按需读取 R2 object。
- 重新计算 `SHA-256`。
- 校验 `sha256`、`size`、`object_key` 是否一致。
- 校验 `ref_count` 是否等于 `file_index` 和回收站引用数。
- 校验 `storage_usage` 是否有缺失或多余记录。

这些检查不需要第一阶段就做成 UI，但可以先把 helper 写成后台维护接口或脚本。

## API 建议

第一阶段可以不新增前端交互，只改现有上传响应。后续如果要做秒传，可以增加：

```text
POST /api/upload/check
body:
{
  "targetDir": "docs",
  "name": "a.pdf",
  "size": 123,
  "sha256": "..."
}
```

响应：

```json
{
  "success": true,
  "exists": true,
  "key": "docs/a.pdf",
  "storageId": "r2",
  "skippedUpload": true
}
```

如果不存在：

```json
{
  "success": true,
  "exists": false
}
```

## 实施步骤

建议分阶段做，避免一次改动影响上传、下载、删除、回收站和配额所有链路。

### 阶段 1：数据模型和普通上传

- 新增 migration：`storage_objects` 表和索引。
- 新增 helper：计算 SHA-256、生成 R2 object key、查找或创建 storage object。
- 修改 `handleUpload`：
  - 计算 hash。
  - 命中已有对象时跳过 R2 put。
  - 未命中时写入 `objects/sha256/...`。
  - `upsertFileIndex` 时传入真实 `objectKey`。
- 补测试：
  - 同内容不同名只产生一个 `storage_objects`。
  - 同名不同内容产生两个 `storage_objects`。
  - 重复上传不增加 `storage_usage`。

### 阶段 2：读取链路审计

- 检查下载、预览、分享、zip 下载、WebDAV 是否都通过 `object_key` 读取。
- 修复仍然直接使用用户路径读 R2 的位置。
- 补测试覆盖 `file_index.path !== file_index.object_key` 的情况。

### 阶段 3：删除和回收站

- 调整删除：删除逻辑文件时只减少引用，不直接删除真实对象。
- 调整回收站：回收站保存逻辑引用，不复制真实 R2 对象。
- 清空回收站时才减少引用并尝试清理 R2。
- 补测试：
  - 两个文件共享 object，删除一个不影响另一个下载。
  - 最后一个引用删除后才删除 R2。
  - 回收站恢复后仍指向同一 object。

### 阶段 4：分片上传和秒传

- 前端上传前计算 SHA-256。
- 新增 `/api/upload/check`。
- 命中已有对象时直接创建逻辑文件记录。
- 未命中时继续 multipart 上传。
- complete 后写入 `storage_objects`。

### 阶段 5：一致性维护

- 增加后台一致性检查任务。
- 增加 `ref_count` 重建任务。
- 增加孤儿对象清理任务。

## 风险点

- `SHA-256` 碰撞理论上存在，但工程上可以认为极难发生；配合 `size` 后误判概率更低。
- 普通上传如果用 `arrayBuffer()` 计算 hash，会增加内存压力，需要限制普通上传大小或让大文件走 multipart。
- 回收站当前偏向复制 R2 对象，去重后需要重新设计，否则空间节省会被抵消。
- 任何直接用用户路径访问 R2 的旧代码，都会在 `path !== object_key` 后出错，需要重点审计。
- 如果未来做客户端端到端加密，同一原始文件加密后可能得到不同密文，普通内容去重会失效。

## 推荐结论

这个方案可行，且与当前 `file_index.object_key`、`storage_usage` 的设计方向一致。后续实现时建议先做“新上传普通文件去重”，暂不迁移已有文件，等读取链路和删除链路都稳定后，再考虑分片上传、秒传和存量迁移。
