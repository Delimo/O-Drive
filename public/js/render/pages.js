export function createPageRenderers(deps) {
  const {
    icons,
    escapeHtml,
    renderEmptyState,
    formatBytes,
    formatTime,
    formatRelative,
  } = deps;

  function renderAdminStats(stats) {
    const breakdown = Object.entries(stats.breakdown || {});
    const latest = stats.latest || [];
    const attention = stats.attention || [];

    return `
      <div class="admin-frame">
        <section class="admin-strip glass-card">
          <div class="status-main">
            <span class="status-dot"></span>
            <span>后台概览</span>
          </div>
          <div class="admin-strip-actions">
            <span class="toolbar-tag">${escapeHtml(stats.index?.recommendation || '正常')}</span>
          </div>
        </section>

        <section class="admin-content glass-card">
          <div class="admin-grid">
            <div class="admin-card span-4">
              <div class="admin-label">文件总数</div>
              <div class="admin-value">${escapeHtml(String(stats.files?.count || 0))}</div>
              <div class="admin-copy">总容量 ${escapeHtml(stats.files?.totalSizeFormatted || '0 B')}，目录标记 ${escapeHtml(String(stats.files?.folderMarkers || 0))}。</div>
            </div>

            <div class="admin-card span-4">
              <div class="admin-label">回收站项目</div>
              <div class="admin-value">${escapeHtml(String(stats.trash?.count || 0))}</div>
              <div class="admin-copy">累计 ${escapeHtml(stats.trash?.sizeFormatted || '0 B')}，约占文件总量 ${escapeHtml(String(stats.trash?.percentOfFiles || 0))}% 。</div>
            </div>

            <div class="admin-card span-4">
              <div class="admin-label">索引状态</div>
              <div class="admin-value">${escapeHtml(stats.index?.recommendation || '等待初始化')}</div>
              <div class="admin-copy">索引记录 ${escapeHtml(String(stats.index?.count || 0))} 条，最近更新 ${escapeHtml(stats.index?.latestUpdatedAt ? formatTime(stats.index.latestUpdatedAt) : '未知')}。</div>
            </div>

            <div class="admin-card span-6">
              <div class="admin-label">类型分布</div>
              <div class="latest-list">
                ${
                  breakdown.length
                    ? breakdown.map(([key, value]) => `
                      <article class="latest-item">
                        <h3 class="latest-title">${escapeHtml(key)}</h3>
                        <div class="latest-copy">${escapeHtml(String(value.count || 0))} 项 · ${escapeHtml(value.sizeFormatted || formatBytes(value.size || 0))}</div>
                      </article>
                    `).join('')
                    : '<div class="muted">暂无分类数据</div>'
                }
              </div>
            </div>

            <div class="admin-card span-6">
              <div class="admin-label">系统提醒</div>
              <div class="attention-list">
                ${
                  attention.length
                    ? attention.map(item => `
                      <article class="attention-item" data-level="${escapeHtml(item.level || 'info')}">
                        <h3 class="attention-title">${escapeHtml(item.title || '系统提示')}</h3>
                        <div class="attention-copy">${escapeHtml(item.body || '')}</div>
                      </article>
                    `).join('')
                    : '<div class="muted">暂无系统提醒</div>'
                }
              </div>
            </div>

            <div class="admin-card span-12">
              <div class="admin-label">最近资源</div>
              <div class="latest-list">
                ${
                  latest.length
                    ? latest.map(item => `
                      <article class="latest-item">
                        <h3 class="latest-title">${escapeHtml(item.key || '')}</h3>
                        <div class="latest-copy">${escapeHtml(item.sizeFormatted || formatBytes(item.size || 0))} · ${escapeHtml(formatRelative(item.uploaded || 0))}</div>
                      </article>
                    `).join('')
                    : '<div class="muted">暂无最近资源记录</div>'
                }
              </div>
            </div>
          </div>
        </section>
      </div>
    `;
  }

  function renderAdminPage(state) {
    const { role } = state.app;
    const { loading, stats, error } = state.admin;

    if (role !== 'admin') {
      return `
        <section class="auth-board glass-card admin-content">
          ${renderEmptyState('需要管理员登录', '登录后即可查看文件统计、索引状态和最近资源动态。', icons.lock)}
        </section>
      `;
    }

    return `
      <section class="admin-board">
        ${
          loading
            ? renderEmptyState('正在加载概览', '正在统计文件数量、索引状态与回收站信息。', icons.stats)
            : error
              ? renderEmptyState('概览加载失败', error, icons.lock)
              : stats
                ? renderAdminStats(stats)
                : renderEmptyState('暂无数据', '后台接口已经就绪，但当前还没有返回可展示的数据。', icons.stats)
        }
      </section>
    `;
  }

  function renderSharePreview(token, item) {
    if (!item.allowPreview) {
      return renderEmptyState('预览已关闭', '当前分享仅允许下载，不开放在线预览。', icons.lock);
    }
    const src = `/api/share/${encodeURIComponent(token)}/preview`;
    const type = String(item.contentType || '').toLowerCase();
    if (type.startsWith('image/')) return `<img src="${src}" alt="${escapeHtml(item.name)}">`;
    if (type.startsWith('video/')) return `<video src="${src}" controls></video>`;
    if (type.startsWith('audio/')) return `<div class="empty-state"><audio src="${src}" controls style="width:min(520px,100%);"></audio></div>`;
    return `<iframe src="${src}" title="${escapeHtml(item.name)}"></iframe>`;
  }

  function renderSharePage(state) {
    const share = state.share;
    const item = share.item;

    return `
      <section class="share-board glass-card">
        <aside class="share-side">
          <span class="toolbar-tag">安全分享入口</span>
          <div style="margin-top:18px;">
            <h2 class="panel-title">分享访问页</h2>
            <p class="panel-copy">这里展示分享信息、访问状态和预览内容。</p>
          </div>
          <div class="stack" style="margin-top:28px;">
            <div class="detail-card" style="background:rgba(255,255,255,0.12); border-color:rgba(255,255,255,0.14);">
              <div class="detail-key" style="color:rgba(255,255,255,0.7);">分享 Token</div>
              <div class="detail-value">${escapeHtml(share.token || '未提供')}</div>
            </div>
            <div class="detail-card" style="background:rgba(255,255,255,0.12); border-color:rgba(255,255,255,0.14);">
              <div class="detail-key" style="color:rgba(255,255,255,0.7);">访问状态</div>
              <div class="detail-value">${share.requiresPassword ? '需要密码' : item ? '可访问' : share.error ? '加载失败' : '等待读取'}</div>
            </div>
          </div>
        </aside>

        <div class="share-main">
          ${
            share.loading
              ? renderEmptyState('正在读取分享', '正在加载分享文件信息与预览权限。', icons.refresh)
              : share.error && !share.requiresPassword
                ? renderEmptyState('分享不可用', share.error, icons.lock)
                : share.requiresPassword
                  ? `
                    <div class="empty-state" style="min-height:100%;">
                      <div>
                        <div class="empty-orb">${icons.lock}</div>
                        <h3 class="empty-title">请输入访问密码</h3>
                        <p class="empty-copy">${escapeHtml(share.error || '该分享资源启用了额外保护，输入正确密码后即可查看内容。')}</p>
                        <form class="modal-form" data-form="share-password" style="max-width:340px; margin:22px auto 0;">
                          <input class="inline-input" type="password" name="password" value="${escapeHtml(share.password)}" placeholder="输入分享密码">
                          <button class="btn btn-primary" type="submit">解锁分享</button>
                        </form>
                      </div>
                    </div>
                  `
                  : item
                    ? `
                      <div class="status-bar">
                        <div class="status-main">
                          <span class="status-dot"></span>
                          <span>${escapeHtml(item.name)} · ${escapeHtml(item.sizeFormatted)}</span>
                        </div>
                      </div>
                      <div class="preview-stage">
                        ${renderSharePreview(share.token, item)}
                      </div>
                    `
                    : renderEmptyState('等待分享链接', '当前页面没有读到分享 token，可通过 share.html?token=你的分享码 打开。', icons.file)
          }
        </div>
      </section>
    `;
  }

  return {
    renderAdminPage,
    renderSharePage,
  };
}
