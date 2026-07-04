# O-Drive 文档索引

## 当前文档

| 文档 | 用途 |
| --- | --- |
| `maintenance-handoff.md` | 后续维护者的接手入口，本地命令、核心模块、近期变更和下一步建议。 |
| `architecture.md` | 前端分层、样式约定和后端 API 路由约定。 |
| `frontend.md` | 前端入口、状态、渲染、事件、工作流和测试维护说明。 |
| `frontend-style.md` | 前端视觉风格指南，记录颜色、排版、组件、页面密度和重做页面时的设计检查清单。 |
| `layout.md` | 页面布局、region、flex 链路和常见布局排查。 |
| `admin-page.md` | 后台管理页 Tab、渲染器和事件约定。 |
| `audit-findings.md` | 安全、并发、前端状态和 Webhook 等代码审计发现。 |
| `fix-progress.md` | 审计发现和路线图任务的修复进度、复核结果和接续入口。 |
| `project-roadmap.md` | 后续功能与代码优化建议，覆盖大目录任务化、索引修复、WebDAV、可观测性、分享和测试基础设施。 |

## 治理状态

- 当前目录没有保留已完成的一次性 mockup、临时交接稿或过期路线图。
- `frontend-style.md` 和 `layout.md` 仍是长期设计/布局参考，不作为临时计划清理。
- 后续如果出现 `*-review.md`、`*-plan.md`、`*-todo.md` 等阶段性文档，完成后优先合并到本索引、`maintenance-handoff.md`、`architecture.md` 或对应主题文档，再删除原文件。

## 维护约定

- 新增文档后同步更新本索引。
- 过程记录、临时交接稿、一次性 mockup 处理完成后直接清理。
- 已落地的规划文档直接删除；必要背景合并进交接文档或架构约定。
- 当前实现说明不要依赖易失效的代码行号，优先引用文件路径和模块职责。
