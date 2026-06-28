# 页面布局说明

> 本文档记录当前页面布局契约，不绑定具体行号。代码重排后只要结构不变，本文档仍可作为排查基准。

## 入口结构

HTML 入口文件：

| 页面 | 文件 | `body[data-page]` |
| --- | --- | --- |
| 云盘首页 | `public/index.html` | `home` |
| 管理后台 | `public/admin.html` | `admin` |
| 分享页 | `public/share.html` | `share` |

三个页面都挂载到 `#app`，运行时入口是 `public/index.js`。

`public/index.js` 负责创建全局区域：

| 区域 | 说明 |
| --- | --- |
| `[data-region="header"]` | 顶栏，所有页面共享。 |
| `[data-region="explorer"]` | 仅首页使用，承载云盘工具栏和文件区。 |
| `[data-region="detail-drawer"]` | 仅首页使用，承载右侧详情抽屉。 |
| `[data-region="modal"]` | 全局弹窗。 |
| `[data-region="toast"]` | 全局提示。 |
| `[data-region="drop-overlay"]` | 拖拽上传遮罩。 |
| `[data-region="uploads"]` | 仅首页使用，承载上传面板。 |

管理后台和分享页不走 `[data-region="explorer"]`，它们通过 `renderMain(state)` 直接渲染主内容。

## 首页布局

首页内容由 `public/js/render/home.js` 渲染，核心结构是：

```text
#app
  header region
  explorer region
    .toolbar-card
    .explorer-card
  detail drawer region
  modal region
  toast region
  drop overlay region
  uploads region
```

首页的关键 flex 链路：

```text
body
  #app
    [data-region="explorer"]
      .explorer-card
```

`[data-region="explorer"]` 必须保持：

```css
display: flex;
flex-direction: column;
flex: 1;
min-height: 0;
```

`.explorer-card` 必须保持 `flex-1 min-h-0 overflow-y-auto flex flex-col`，否则文件区高度和滚动会异常。

## 管理后台布局

后台页面由 `public/js/render/pages/index.js` 渲染，Tab 内容再分发到 `public/js/render/pages/admin/`。

核心结构是：

```text
#app
  header region
  .toolbar-card
    .admin-tab-bar
  .explorer-card
    active admin tab content
  modal region
  toast region
  drop overlay region
```

后台没有 `[data-region="explorer"]` 这一层，`.explorer-card` 直接由 `renderAdminPage(state)` 创建。

当前后台 Tab 和维护说明见 `docs/admin-page.md`。

## 分享页布局

分享页同样通过 `renderMain(state)` 渲染，内容来自 `renderSharePage(state)`。

分享页不显示首页工具栏、上传面板、详情抽屉，也不需要首页的 explorer region。

## CSS 来源

样式源文件在 `public/css/`，构建后输出到 `public/main.css`。

修改源 CSS 后，需要运行构建流程更新 `public/main.css`。不要只改构建产物，否则下一次构建会覆盖。

主要布局相关文件：

| 文件 | 说明 |
| --- | --- |
| `public/css/tokens.css` | 颜色、阴影、圆角等变量。 |
| `public/css/components.css` | 按钮、卡片、弹窗等通用组件。 |
| `public/css/pages/explorer.css` | 首页文件区相关样式。 |
| `public/css/pages/admin.css` | 后台页面相关样式。 |
| `public/css/pages/share.css` | 分享页相关样式。 |
| `public/main.css` | 实际被 HTML 引用的构建产物。 |

## 常见问题排查

### 文件区没有撑满高度

优先检查：

- `body` 是否仍是纵向 flex 布局。
- `#app` 是否仍有 `flex: 1` 和 `min-height: 0`。
- `[data-region="explorer"]` 是否仍有 `display:flex; flex-direction:column; flex:1; min-height:0`。
- `.explorer-card` 是否仍有 `flex-1 min-h-0 overflow-y-auto`。

### 文件区底部间距异常

优先检查：

- `.explorer-card` 的 padding 是否被覆盖。
- 首页 `renderHomePage()` 末尾的底部占位是否仍存在。
- `public/main.css` 是否已由最新源 CSS 构建生成。

### 后台页正常但首页异常

优先检查 `[data-region="explorer"]`。后台页没有这一层，所以后台正常不能证明首页 flex 链路也是正常的。

### 修改后浏览器看不到变化

优先检查：

- 是否改了源 CSS 但没有重新构建 `public/main.css`。
- 是否浏览器缓存了旧资源。
- 是否改了某个 Tab 渲染文件，但当前页面没有进入对应 Tab。

## 修改约定

- 不要在 Tab 子渲染器里重建 `.explorer-card` 外层布局。
- 不要给首页移除 `[data-region="explorer"]` 的 flex 样式。
- 不要把页面高度逻辑写成固定 `100vh - Npx`，除非确实是在处理局部滚动容器。
- 新增全局浮层优先使用独立 region，避免塞进 `.explorer-card` 内部。
