import { createSharePageRenderer } from "./share-page.js";

export function createSharesRenderer({
  safeText, escapeHtml, renderEmptyStateCompact, formatTime, formatRelative, formatBytes,
  filterShares, getFilterLabel, getShareStatusTags, isShareActive, components
}) {

  function renderAdminSharesSection(admin) {
    const {
      shares = [], shareFilter = "all", shareSearch = "", sharesLoading, sharesError
    } = admin;

    if (sharesError) {
      return components.renderErrorCard({ icon: "", error: sharesError, onRetry: "refresh-admin-shares" });
    }
    if (sharesLoading) {
      return renderEmptyStateCompact("载入中", "拉取外链列表中...", "");
    }

    const now = Date.now();
    const normalizedSearch = String(shareSearch || "").trim().toLowerCase();
    const visibleShares = filterShares(shares, shareFilter).filter((item) => {
      if (!normalizedSearch) return true;
      const haystacks = [
        item?.name,
        item?.path,
        item?.token,
        item?.lastAccessIp,
        item?.contentType
      ];
      return haystacks.some((value) => String(value || "").toLowerCase().includes(normalizedSearch));
    });
    const totalShares = shares.length;
    const activeShares = shares.filter((item) => !item?.expired && !item?.exhausted && !(item?.expiresAt && item.expiresAt < now)).length;
    const inactiveShares = totalShares - activeShares;
    const passwordShares = shares.filter((item) => item?.hasPassword).length;
    const selectedLabel = getFilterLabel(shareFilter);
    const hasSearch = String(shareSearch || "").trim().length > 0;

    function renderStat(label, value, tone = "") {
      return `
        <div class="ov-share-stat${tone ? ` ov-share-stat-${tone}` : ""}">
          <span class="ov-share-stat-label">${escapeHtml(label)}</span>
          <span class="ov-share-stat-value">${escapeHtml(String(value))}</span>
        </div>
      `;
    }

    function renderShareTags(item) {
      const tags = getShareStatusTags(item);
      return tags
        .filter((tag) => tag.className !== "tag-password")
        .slice(0, 3)
        .map((tag) => `<span class="ov-share-pill ${escapeHtml(tag.className)}">${escapeHtml(tag.label)}</span>`)
        .join("");
    }

    function renderShareItem(share) {
      const isExpired = share?.expired || (share?.expiresAt && share.expiresAt < now);
      const isExhausted = share?.exhausted;
      const isActive = isShareActive(share);
      const canReactivate = Boolean(
        share?.canReactivate || (isExpired && !isExhausted && Number(share?.autoDeleteAt || 0) > now),
      );
      const expiresAt = Number(share?.expiresAt || 0);
      const targetLabel =
        share?.targetType === "bundle" ? "集合" : share?.targetType === "folder" ? "文件夹" : "文件";
      const statusText = isExpired ? "已失效" : isExhausted ? "已用尽" : "有效";
      const statusClass = isExpired ? "ov-badge-error" : isExhausted ? "ov-badge-warn" : "ov-badge-ok";
      const itemStateClass = isExpired ? " is-expired" : isExhausted ? " is-exhausted" : " is-active";
      const lastAccessText = share?.lastAccessedAt
        ? formatRelative(share.lastAccessedAt)
        : "暂无记录";
      const downloadsText = `${share.downloadCount || 0}/${share.maxDownloads || "∞"}`;
      const visitsText = String(share.visitCount || 0);
      const expiresText = expiresAt ? formatTime(Math.floor(expiresAt / 1000)) : "无限期";
      const accessLogs = Array.isArray(share.accessLogs) ? share.accessLogs.slice(0, 3) : [];
      const actionLabels = { info: "访问", preview: "预览", download: "下载", unlock: "解锁" };

      return `
        <div class="ov-share-item${itemStateClass}">
          <div class="ov-share-main">
            <div class="ov-share-item-head">
              <div class="ov-share-item-title-row">
                <span class="ov-share-dot${isActive ? " is-on" : ""}"></span>
                <span class="ov-share-name">${safeText(share.name, "未命名资源")}</span>
                <span class="ov-share-pill">${escapeHtml(targetLabel)}</span>
              </div>
              <div class="ov-share-path">${escapeHtml(share.path || "-")}</div>
            </div>
            <div class="ov-share-tags">
              ${components.renderBadge({ label: statusText, className: statusClass })}
              ${share?.hasPassword ? `<span class="ov-share-pill tag-password">有密码</span>` : ""}
              ${renderShareTags(share)}
            </div>
          </div>
          <div class="ov-share-meta-strip">
            <span class="ov-share-meta-item">
              <span class="ov-share-meta-label">最近访问</span>
              <strong class="ov-share-meta-value">${escapeHtml(lastAccessText)}</strong>
            </span>
            <span class="ov-share-meta-item">
              <span class="ov-share-meta-label">访问</span>
              <strong class="ov-share-meta-value">${escapeHtml(visitsText)}</strong>
            </span>
            <span class="ov-share-meta-item">
              <span class="ov-share-meta-label">下载</span>
              <strong class="ov-share-meta-value">${escapeHtml(downloadsText)}</strong>
            </span>
            <span class="ov-share-meta-item">
              <span class="ov-share-meta-label">到期</span>
              <strong class="ov-share-meta-value">${escapeHtml(expiresText)}</strong>
            </span>
          </div>
          ${accessLogs.length ? `
            <div class="ov-share-access-log">
              ${accessLogs.map((log) => `
                <span class="ov-share-access-chip">
                  ${escapeHtml(actionLabels[log.action] || log.action || "访问")}
                  ${log.ip ? ` · ${escapeHtml(log.ip)}` : ""}
                  ${log.createdAt ? ` · ${escapeHtml(formatRelative(log.createdAt))}` : ""}
                </span>
              `).join("")}
            </div>
          ` : ""}
          <div class="ov-share-actions">
            <button class="btn btn-sm" type="button"
                    data-action="copy-share-link" data-key="${escapeHtml(share.token)}"
                    aria-label="复制分享链接">复制</button>
            ${canReactivate ? `
              <button class="btn btn-primary btn-sm" type="button"
                      data-action="confirm-reactivate-share"
                      data-key="${escapeHtml(share.token)}"
                      data-name="${escapeHtml(share.name)}"
                      aria-label="重新启用分享链接">重新启用</button>
            ` : ""}
            <button class="btn btn-danger btn-sm" type="button"
                    data-action="confirm-delete-share"
                    data-key="${escapeHtml(share.token)}"
                    data-name="${escapeHtml(share.name)}"
                    aria-label="移除分享链接">移除</button>
          </div>
        </div>
      `;
    }

    return `
      <div class="ov-shares">
        <div class="ov-shares-hero">
          <div class="ov-shares-title-group">
            <h2 class="ov-shares-title">分享链接</h2>
            <p class="ov-shares-desc">管理已生成的文件分享。链接过期后会保留 7 天，期间可手动删除；超过 7 天会自动清理。</p>
          </div>
          <div class="ov-shares-hero-actions">
            <button class="btn btn-sm" type="button" data-action="refresh-admin-shares">刷新</button>
            <button class="btn btn-danger btn-sm" type="button" data-action="confirm-cleanup-expired-shares">清理过期</button>
          </div>
        </div>

        <div class="ov-share-stats">
          ${renderStat("全部链接", totalShares)}
          ${renderStat("有效", activeShares, "success")}
          ${renderStat("已失效", inactiveShares, "danger")}
          ${renderStat("有密码", passwordShares, "accent")}
        </div>

        <div class="ov-share-filter-shell">
          <div class="ov-share-filter-row">
            <input class="input ov-share-search" type="text"
                   data-action-input="set-shares-search" value="${escapeHtml(shareSearch)}"
                   placeholder="搜索文件名或路径">
            ${components.renderCustomSelect({
              value: shareFilter,
              options: [
                { value: "all", label: "全部状态" },
                { value: "active", label: "有效" },
                { value: "expired", label: "已失效" },
                { value: "exhausted", label: "已用尽" },
              ],
              actionChange: "set-shares-filter",
              dataKey: "",
              className: "ov-share-status-select",
            })}
            <div class="ov-share-filter-actions">
              <button class="btn btn-sm" type="button" data-action="filter-shares">筛选</button>
              <button class="btn btn-sm" type="button" data-action="reset-shares-filter">重置</button>
            </div>
          </div>
          <div class="ov-share-filter-meta">
            <span>当前状态：${escapeHtml(selectedLabel)}</span>
            <span>显示 ${escapeHtml(String(visibleShares.length))} / ${escapeHtml(String(totalShares))} 条</span>
          </div>
        </div>

        <div class="ov-share-panel">
          ${visibleShares.length === 0
            ? `
              <div class="ov-share-empty">
                <div class="ov-share-empty-title">${hasSearch || shareFilter !== "all" ? "没有匹配的分享" : "暂无分享链接"}</div>
                <div class="ov-share-empty-desc">${hasSearch || shareFilter !== "all" ? `当前筛选条件「${escapeHtml(selectedLabel)}」下没有结果。` : "创建分享后会在这里显示。"}</div>
              </div>
            `
            : `<div class="ov-share-list">${visibleShares.map((share) => renderShareItem(share)).join("")}</div>`
          }
        </div>
      </div>
    `;
  }

  const sharePage = createSharePageRenderer({
    safeText,
    escapeHtml,
    formatTime,
    formatBytes,
  });

  return {
    renderAdminSharesSection,
    renderSharePage: sharePage.renderSharePage,
  };
}
