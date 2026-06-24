# 后台管理页图标清单 — 删除/替换参考

> 遍历 `public/js/render/pages/admin/` 下 10 个文件，共 79 处 `icons.xxx` 引用。
> 每个图标标记了所在文件、行号、显示位置、用途说明。

---

## overview.js（12 处）

| 行号 | 图标 | 显示位置 | 用途说明 |
|------|------|---------|---------|
| 111 | `icons.stats` | 4 个 hero 卡片之一 | 文件总数卡片图标 |
| 119 | `icons.trash` | 4 个 hero 卡片之一 | 回收站卡片图标 |
| 130 | `icons.eye` | 4 个 hero 卡片之一 | 索引状态卡片图标 |
| 139 | `icons.share` | 4 个 hero 卡片之一 | 分享卡片图标 |
| 151 | `icons.grid` | 左侧 7 格卡片 header | 文件类型分布卡片图标 |
| 161 | `icons.bell` | 右侧 5 格卡片 header | 系统提醒卡片图标（另带背景色） |
| 171 | `icons.list` | 通栏卡片 header | 最近活动卡片图标 |
| 184 | `icons.lock` | 错误状态页 | 概览加载失败 orb 图标 |
| 106 | - (按钮文字) | 刷新按钮 | `data-action="refresh-admin"` |
| 135 | - (按钮文字) | hero 卡片内部 | 重建索引按钮 |

> `icons.stats` 在行 111 和 112 分别用在两个不同位置，实际上行 112 是模板字符串中的嵌入。

---

## storage.js（8 处）

| 行号 | 图标 | 显示位置 | 用途说明 |
|------|------|---------|---------|
| 19 | `icons.stats` | 错误卡片 | `renderErrorCard` 的 icon 参数 |
| 26 | `icons.stats` | 加载状态 | `renderEmptyState` 的 icon 参数 |
| 73 | `icons.stats` | 加载状态（第二个渲染函数） | `renderEmptyStateCompact` 的 icon 参数 |
| 94 | `icons.spinner` | 回收站加载状态 | `renderEmptyStateCompact` 的 icon 参数 |
| 125 | `icons.stats` | 存储用量卡片 header | 左侧 7 格卡片图标 |
| 143 | `icons.settings \|\| icons.edit` | 操作卡片 header | 右侧 5 格卡片图标（`settings` 未定义，兜底 `edit`） |
| 148 | `icons.edit` | 操作卡片内部 | "编辑配额"按钮旁的图标 |
| 156 | `icons.trash` | 回收站设置卡片 header | 底部通栏卡片图标 |

---

## shares.js（14 处）

| 行号 | 图标 | 显示位置 | 用途说明 |
|------|------|---------|---------|
| 21 | `icons.lock` | 错误状态 | 分享列表加载失败 orb 图标 |
| 26 | `icons.refresh` | 错误状态按钮内 | "重新加载"按钮内的图标 |
| 119 | `icons.share` | 3 个 hero 卡片之一 | 分享总数卡片图标 |
| 127 | `icons.check` | 3 个 hero 卡片之一 | 有效分享卡片图标 |
| 135 | `icons.close` | 3 个 hero 卡片之一 | 已失效卡片图标 |
| 146 | `icons.search` | 筛选卡片 header | 筛选区域卡片图标 |
| 160 | `icons.spinner` | 加载状态 | "正在加载分享列表" icon 参数 |
| 164 | `icons.share` | 空状态 | "暂无分享记录" icon 参数 |
| 166 | `icons.search` | 空状态 | "筛选结果为空" icon 参数 |
| 186 | `icons.lock` | 预览关闭状态 | "预览已关闭" orb 图标 |
| 214 | `icons.spinner` | 加载状态（公共分享页） | "正在读取分享" icon 参数 |
| 215 | `icons.lock` | 错误状态（公共分享页） | "分享不可用" orb 图标 |
| 219 | `icons.lock` | 密码解锁页（公共分享页） | 锁图标展示区域 |
| 236 | `icons.file` | 空状态（公共分享页） | "等待分享链接" icon 参数 |

> 行 214-236 属于 `renderSharePage`（公共分享页），不在 7 个 tab 范围内，**可以不改**。

---

## paths.js（8 处）

| 行号 | 图标 | 显示位置 | 用途说明 |
|------|------|---------|---------|
| 14 | `icons.lock` | 加载状态 | "正在加载受保护路径" icon 参数 |
| 16 | `icons.lock` | 错误状态 | 受保护路径加载失败 orb 图标 |
| 18 | `icons.lock` | 空状态 | "暂无受保护路径" icon 参数 |
| 42 | `icons.eye` | 加载状态 | "正在加载隐藏路径" icon 参数 |
| 44 | `icons.eye` | 错误状态 | 隐藏路径加载失败 orb 图标 |
| 46 | `icons.eye` | 空状态 | "暂无隐藏路径" icon 参数 |
| 76 | `icons.lock` | 受保护路径卡片 header | 左侧卡片图标 |
| 84 | `icons.eye` | 隐藏路径卡片 header | 右侧卡片图标 |

---

## logs.js（4 处）

| 行号 | 图标 | 显示位置 | 用途说明 |
|------|------|---------|---------|
| 17 | `icons.lock` | 错误状态 | 日志加载失败 orb 图标 |
| 36 | `icons.search` | 筛选卡片 header | 筛选区域卡片图标 |
| 59 | `icons.refresh` | 加载状态 | "正在加载日志" icon 参数 |
| 61 | `icons.list` | 空状态 | "暂无操作日志" icon 参数 |

---

## maintenance.js（9 处）

| 行号 | 图标 | 显示位置 | 用途说明 |
|------|------|---------|---------|
| 26 | `icons.spinner` | 加载状态 | "正在获取系统维护快照" icon 参数 |
| 92 | `icons.spinner` | 维护操作按钮内 | 按钮执行中显示的旋转图标 |
| 104 | `icons.spinner` | 加载状态 | "正在获取回收站保留天数" icon 参数 |
| 128 | `icons.spinner` | 加载状态 | "正在获取任务列表" icon 参数 |
| 130 | `icons.list` | 空状态 | "暂无任务" icon 参数 |
| 171 | `icons.stats` | 系统快照卡片 header | 第一个卡片图标 |
| 179 | `icons.trash` | 回收站设置卡片 header | 第二个卡片图标 |
| 187 | `icons.list` | 后台任务卡片 header | 第三个卡片图标 |
| 198 | `icons.spinner` | 加载状态（第二个渲染函数） | `renderAdminTaskListSection` 的 icon 参数 |

---

## system.js（12 处）

| 行号 | 图标 | 显示位置 | 用途说明 |
|------|------|---------|---------|
| 25 | `icons.eye` | 加载状态 | "正在检查服务组件状态" icon 参数 |
| 47 | `icons.stats` | 加载状态 | "正在获取存储配额信息" icon 参数 |
| 62 | `icons.bell` | 加载状态 | "正在获取通知历史" icon 参数 |
| 71 | `icons.bell` | 空状态 | "暂无通知" icon 参数 |
| 90 | `icons.link` | 加载状态 | "正在加载 Webhook 配置" icon 参数 |
| 92 | `icons.link` | 空状态 | "暂无 Webhook" icon 参数 |
| 120 | `icons.list` | 加载状态 | "正在加载投递记录" icon 参数 |
| 122 | `icons.list` | 空状态 | "暂无投递记录" icon 参数 |
| 159 | `icons.eye` | 环境检查卡片 header | 左侧 7 格卡片图标 |
| 166 | `icons.stats` | 存储配额卡片 header | 右侧 5 格卡片图标 |
| 175 | `icons.bell` | 通知中心卡片 header | 通栏卡片图标 |
| 184 | `icons.link` | Webhook 配置卡片 header | 左侧 6 格卡片图标 |
| 192 | `icons.list` | Webhook 投递记录卡片 header | 右侧 6 格卡片图标 |

---

## components.js（3 处）— 通用组件，被多个 tab 引用

| 行号 | 图标 | 组件 | 用途说明 |
|------|------|------|---------|
| 9 | `icons.lock` (兜底) | `renderEmptyCard` | 未传 icon 时默认显示锁图标 |
| 19 | `icons.loading` (兜底) | `renderLoadingCard` | 未传 icon 时默认显示加载图标 |
| 33 | `icons.lock` (兜底) | `renderErrorCard` | 未传 icon 时默认显示锁图标 |

> ⚠️ **注意：** 这三个是兜底默认值。如果你的代码调用组件时传了 icon 参数就不会走这里。但如果不传，会显示 `icons.lock` 或 `icons.loading`。如果要完全去掉图标，改这三个兜底，或者不在调用处传 icon。

---

## webhooks.js（10 处）— 被 system.js 引用

| 行号 | 图标 | 显示位置 | 用途说明 |
|------|------|---------|---------|
| 16 | `icons.link` | 错误状态 orb 图标 | webhook 加载失败 |
| 24 | `icons.link` | 加载状态 icon 参数 | "正在加载 Webhook 配置" |
| 33 | `icons.link` | 空状态 icon 参数 | "暂无 Webhook" |
| 76 | `icons.list` | 加载状态 icon 参数 | "正在加载投递记录" |
| 81 | `icons.list` | 空状态 icon 参数 | "暂无投递记录" |
| 123 | `icons.link` | 错误状态 orb 图标 |（第二个渲染函数） |
| 132 | `icons.link` | 加载状态 icon 参数 |（第二个渲染函数） |
| 138 | `icons.link` | 空状态 icon 参数 |（第二个渲染函数） |
| 179 | `icons.list` | 加载状态 icon 参数 |（第二个渲染函数） |
| 185 | `icons.list` | 空状态 icon 参数 |（第二个渲染函数） |

> `webhooks.js` 由 `system.js` 内部的 `createWebhooksRenderer` 创建并调用。即使你不动这个文件，system.js 的渲染也会用到它。

---

## notifications.js（2 处）— 被 system.js 引用

| 行号 | 图标 | 显示位置 | 用途说明 |
|------|------|---------|---------|
| 15 | `icons.bell` | 空状态 | "暂无通知" |
| 29 | `icons.bell` | 空状态 | 第二个渲染函数 |

> `notifications.js` 由 `system.js` 内部的 `createNotificationsRenderer` 创建并调用。同上。

---

## 汇总：每个图标被引用的次数

| 图标 | 出现次数 | 主要用途 |
|------|---------|---------|
| `icons.stats` | 9 | 数据统计类卡片 header 和状态提示 |
| `icons.lock` | 10 | 锁/权限相关卡片 header 和错误状态 orb |
| `icons.eye` | 6 | 可见性/预览相关卡片和状态提示 |
| `icons.share` | 3 | 分享相关卡片 header |
| `icons.trash` | 3 | 回收站相关卡片 header |
| `icons.bell` | 5 | 通知相关卡片 header 和状态提示 |
| `icons.list` | 8 | 列表类卡片 header 和空状态提示 |
| `icons.search` | 3 | 搜索筛选区域卡片 header 和空状态提示 |
| `icons.spinner` | 8 | 加载状态的旋转动画图标 |
| `icons.refresh` | 2 | 刷新/加载状态提示 |
| `icons.grid` | 1 | 文件类型分布卡片 header |
| `icons.check` | 1 | 有效分享卡片 header |
| `icons.close` | 1 | 已失效卡片 header |
| `icons.edit` | 2 | 编辑操作按钮旁（行 143 兜底 + 行 148） |
| `icons.settings` | 1 | 行 143 尝试引用但未定义，实际走 `icons.edit` 兜底 |
| `icons.link` | 6 | webhook 相关卡片 header 和状态提示 |
| `icons.file` | 1 | 公共分享页空状态（不在 7 tab 内） |
| `icons.loading` | 1 | components.js 兜底，未定义（引用了但不存在） |

> **`icons.settings` 和 `icons.loading` 实际在 `icons.js` 中没有定义**，但因为有 `\|\|` 兜底和调用方传参，不会报错。

---

## 删除/替换策略建议

### 方式一：逐个替换（精确控制）
查表定位行号，按文件逐个改 `icons.xxx` 为你的内容。

### 方式二：先改 components.js（覆盖 90% 空状态）
`components.js` 的 3 个兜底影响了 `renderEmptyCard` / `renderLoadingCard` / `renderErrorCard` 在没有传 icon 参数时的默认行为。先改了它们，大部分空/错误/加载状态的图标就变了。

### 方式三：把 icons 对象清空（激进）
把 `public/js/ui/icons.js` 中的 SVG 字符串全置空，所有 `${icons.xxx}` 输出空字符串。但这会影响到**整个应用**（不只是 admin 页），不推荐。
