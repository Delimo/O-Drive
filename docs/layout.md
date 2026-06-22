# 三段式布局说明

## 结构

所有页面共享三段式布局，由 `public/index.js` 的 `render()`（第 282 行）定义 DOM 骨架：

```
body (h-screen overflow-hidden p-4 md:p-6 flex flex-col)
  └─ #app (container mx-auto max-w-[1440px] w-full flex-1 flex flex-col min-h-0)
       ├─ [data-region="header"]            → 顶栏
       │    └─ header.header-card           → 品牌 Logo、搜索、主题切换、通知、登录/管理
       │
       ├─ [data-region="explorer"]           → 中间主区（云盘页独有）
       │    ├─ div.toolbar-card             → 面包屑导航、上传/新建/排序/视图/筛选按钮
       │    └─ div.explorer-card (flex-1)   → 文件网格或列表
       │
       ├─ (其他区域)
       │    [data-region="detail-drawer"]   → 右侧详情抽屉
       │    [data-region="uploads"]         → 上传面板（fixed 定位）
       │    [data-region="modal"]           → 模态框（fixed 定位）
       │    [data-region="toast"]           → 提示消息（fixed 定位）
       │    [data-region="drop-overlay"]    → 拖拽上传遮罩（fixed 定位）
       │
       └─（管理页/分享页走另一分支）
            renderMain() → adminRenderer / shareRenderer 直接放在 #app 下
```

### 页面分支逻辑

在 `render()` 中：

```
page === 'home' → 渲染 [data-region="header"] + [data-region="explorer"] + ...
page === 'admin' → 渲染 [data-region="header"] + renderMain(state)
```

这就是 `data-region="explorer"` 这个额外 wrapper 的来历，也是问题的根源。

---

## 间距规则

| 位置 | 值 | 来源 | 说明 |
|------|-----|------|------|
| 顶部外边距 | 24px | `body` 的 `p-4 md:p-6`（`padding: 1.5rem`） | body 的内边距提供所有侧边的外层间距 |
| header ↔ toolbar | 16px | `header-card` 和 `toolbar-card` 的 `mb-4`（`margin-bottom: 1rem`） | header 与 toolbar 之间 |
| toolbar ↔ content | 16px | `toolbar-card` 的 `mb-4` | toolbar 与 explorer-card 之间 |
| 内容区底部内边距 | 24px | `.explorer-card` 的 `p-6`（`padding: 1.5rem`） | 由 Tailwind 类提供 |
| 底部外边距 | 24px | `body` 的 `p-4 md:p-6` | 与顶部对称 |

**注意**：列表视图（`.list-table-wrap`）的 `max-height: calc(100vh - 200px)` 会影响表格可滚动高度。

---

## 关键约束：flex 链

要让 `.explorer-card` 的 `flex-1` 生效并撑满剩余高度，每一级父容器都必须形成 **flex 链**：

```
body (display:flex; flex-direction:column)
  └─ #app (display:flex; flex-direction:column; flex:1; min-height:0)
       └─ [data-region="explorer"] (display:flex; flex-direction:column; flex:1; min-height:0)
            └─ .explorer-card (flex:1; min-height:0)  ← 生效
```

**如果中间任何一环缺少 `display:flex` 或 `flex:1; min-height:0`，则 flex 链断裂**，`.explorer-card` 只会根据内容自然高度渲染，无法撑满视口。

### 云盘页 vs 管理页的差异

| | 云盘页 | 管理页 |
|--|--------|--------|
| 渲染方式 | 内容放进 `[data-region="explorer"]` | 内容直接放进 `#app` |
| flex 层级 | `body → #app → [data-region="explorer"] → .explorer-card` | `body → #app → .explorer-card` |
| 隐患 | `[data-region="explorer"]` 必须是 flex 容器 | 无额外层级 |

管理页正常但云盘页异常时，优先检查 `[data-region="explorer"]` 的样式。

---

## 涉及文件

| 文件 | 行号 | 作用 |
|------|------|------|
| `public/index.html` | 15-16 | `body` 和 `#app` 的基础结构 |
| `public/admin.html` | 15-16 | 管理页的 `body` 和 `#app` |
| `public/share.html` | 15-16 | 分享页的 `body` 和 `#app` |
| `public/index.js` | 282-305 | `render()` — DOM 骨架，定义所有 `data-region` |
| `public/index.js` | 373-433 | `renderHeader()` — 顶栏 HTML |
| `public/index.js` | 337-341 | `renderExplorerRegion()` — 把 home 内容填入 explorer 区域 |
| `public/js/render/home.js` | 25-75 | `renderHomePage()` — 云盘页的 toolbar + explorer-card |
| `public/js/render/pages/index.js` | 128-168 | `renderAdminPage()` — 管理页的 toolbar + explorer-card |
| `public/main.css` | — | **生产 CSS**（HTML 实际引用的文件） |
| `public/css/pages/explorer.css` | — | 源文件（仅供参考，不直接引用） |

---

## 常见问题排查

### 问题 1：内容区底部间距消失

**现象**：`.explorer-card` 底部没有 24px 空白，内容紧贴卡片底部。

**可能原因**：

1. 生产 CSS（`main.css`）中 `.explorer-card` 被设置了 `padding-bottom: 0 !important`，覆盖了 `p-6`
2. 原生 `p-6` 类未生效（Tailwind 未正确编译）

**验证方法**（浏览器 DevTools）：
- 选中 `.explorer-card`，在 Styles 面板查看 `padding-bottom` 的计算值
- 如果为 0 且有删除线，说明被 `!important` 覆盖
- 查看 `p-6` 类是否出现在 Styles 面板中

**修复**：
```css
/* 错误：覆盖了 p-6 的底部内边距 */
.explorer-card {
  padding-bottom: 0 !important;
}

/* 正确：让 p-6 自然生效，或显式设置 */
.explorer-card {
  padding-bottom: 1.5rem; /* 24px */
}
```

**注意**：`public/css/pages/explorer.css` 是源文件，但 HTML 实际引用的是 `public/main.css`。修改源文件后需同步更新 `main.css`，或重新编译（如果项目有构建流程）。

---

### 问题 2：内容区不撑满视口高度

**现象**：文件列表内容很少时，`.explorer-card` 高度只包裹内容，下方留有空白区域。

**可能原因**：flex 链断裂——`[data-region="explorer"]` 缺少 `display:flex` 或 `flex:1; min-height:0`。

**验证方法**（浏览器 DevTools）：
- 在 Elements 面板中选中 `[data-region="explorer"]`
- 检查 Computed 面板中 `display` 是否为 `flex`
- 检查 `flex` 是否为 `1 1 0%`（flex:1 的计算值）
- 检查 `min-height` 是否为 `0`
- 选中 `.explorer-card` 查看其高度是否等于父容器剩余空间

**修复**：
```js
// public/index.js render() 中
// 错误：无 flex 属性
'<div data-region="explorer"></div>'

// 正确：加上 flex 属性
'<div data-region="explorer" style="display:flex;flex-direction:column;flex:1;min-height:0"></div>'
```

---

### 问题 3：列表视图高度溢出

**现象**：列表模式（`.list-table-wrap`）高度不对，滚动条异常。

**原因**：`.list-table-wrap` 的 `max-height: calc(100vh - 200px)` 是基于视口高度计算的硬编码值，当布局层级变化时可能需要调整。

---

## 修改指南

当需要修改布局 DOM 层级时，必须同步检查以下三点：

1. **flex 链完整性**：从 `body` 到 `.explorer-card` 的每一层是否都是 flex 容器
2. **`min-height: 0`**：`flex-1` 的子元素必须有 `min-height: 0`（或 `overflow` 非 `visible`），否则内容会撑爆容器
3. **`flex-shrink: 0`**：非伸缩元素（如 `.toolbar-card`、`.header-card`）需要 `flex-shrink: 0`，防止被压缩

---

## 快速验证清单

如果布局异常，按顺序检查：

- [ ] `body` → `display: flex; flex-direction: column;`
- [ ] `body` → `p-4 md:p-6` 是否生效（顶部 24px）
- [ ] `#app` → `flex: 1; min-height: 0;`
- [ ] `#app` → `display: flex; flex-direction: column;`
- [ ] `[data-region="explorer"]` → `display: flex; flex-direction: column; flex: 1; min-height: 0`
- [ ] `.explorer-card` → `flex: 1; min-height: 0;`
- [ ] `.explorer-card` → `padding-bottom` **不是** `0 !important`
- [ ] `.explorer-card` → `p-6` 是否被加载（24px padding）
