export function createPageRenderers(deps) {
  const {
    icons,
    escapeHtml,
    renderEmptyState,
    formatBytes,
    formatTime,
    formatRelative,
  } = deps;

  function safeText(value, fallback = '-') {
    const text = String(value ?? '').trim();
    return escapeHtml(text || fallback);
  }

  function renderInfoBlock(label, value) {
    return `
      <div class="detail-card">
        <div class="detail-key">${escapeHtml(label)}</div>
        <div class="detail-value">${value}</div>
      </div>
    `;
  }

  function renderShareMetaLine(label, value) {
    return `<span><strong>${escapeHtml(label)}:</strong> ${value}</span>`;
  }

  function renderAdminStats(stats) {
    const breakdown = Object.entries(stats.breakdown || {});
    const latest = stats.latest || [];
    const attention = stats.attention || [];

    return `
      <section class="admin-frame">
        <section class="admin-strip glass-card">
          <div class="status-main">
            <span class="status-dot"></span>
            <span>后台概览</span>
          </div>
          <div class="admin-strip-actions">
            <span class="toolbar-tag">${safeText(stats.index?.recommendation, '正常')}</span>
          </div>
        </section>

        <section class="admin-content glass-card">
          <div class="admin-grid">
            <div class="admin-card span-4">
              <div class="admin-label">文件总数</div>
              <div class="admin-value">${safeText(stats.files?.count || 0, '0')}</div>
              <div class="admin-copy">
                总容量 ${safeText(stats.files?.totalSizeFormatted, '0 B')}，目录标记 ${safeText(stats.files?.folderMarkers || 0, '0')}。
              </div>
            </div>

            <div class="admin-card span-4">
              <div class="admin-label">回收站项目</div>
              <div class="admin-value">${safeText(stats.trash?.count || 0, '0')}</div>
              <div class="admin-copy">
                累计 ${safeText(stats.trash?.sizeFormatted, '0 B')}，约占文件总量 ${safeText(stats.trash?.percentOfFiles || 0, '0')}%。
              </div>
            </div>

            <div class="admin-card span-4">
              <div class="admin-label">索引状态</div>
              <div class="admin-value">${safeText(stats.index?.recommendation, '等待初始化')}</div>
              <div class="admin-copy">
                索引记录 ${safeText(stats.index?.count || 0, '0')} 条，最近更新
                ${safeText(stats.index?.latestUpdatedAt ? formatTime(stats.index.latestUpdatedAt) : '未知')}。
              </div>
            </div>

            <div class="admin-card span-6">
              <div class="admin-label">类型分布</div>
              <div class="latest-list">
                ${
                  breakdown.length
                    ? breakdown.map(([key, value]) => `
                      <article class="latest-item">
                        <h3 class="latest-title">${safeText(key)}</h3>
                        <div class="latest-copy">
                          ${safeText(value.count || 0, '0')} 项 · ${safeText(value.sizeFormatted || formatBytes(value.size || 0), '0 B')}
                        </div>
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
                      <article class="attention-item" data-level="${safeText(item.level || 'info')}">
                        <h3 class="attention-title">${safeText(item.title || '系统提示')}</h3>
                        <div class="attention-copy">${safeText(item.body || '')}</div>
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
                        <h3 class="latest-title">${safeText(item.key || '')}</h3>
                        <div class="latest-copy">
                          ${safeText(item.sizeFormatted || formatBytes(item.size || 0), '0 B')} · ${safeText(formatRelative(item.uploaded || 0), '刚刚')}
                        </div>
                      </article>
                    `).join('')
                    : '<div class="muted">暂无最近资源记录</div>'
                }
              </div>
            </div>
          </div>
        </section>
      </section>
    `;
  }

  function renderAdminShares(admin) {
    const shares = admin.shares || [];
    const busyToken = admin.shareBusyToken || '';
    const totalCount = shares.length;
    const expiredCount = shares.filter(item => item?.expired).length;
    const passwordCount = shares.filter(item => item?.hasPassword).length;

    return `
      <section class="admin-frame" style="margin-top:18px;">
        <section class="admin-strip glass-card">
          <div class="status-main">
            <span class="status-dot"></span>
            <span>分享管理</span>
          </div>
          <div class="btn-row admin-strip-actions">
            <button class="btn btn-muted" type="button" data-action="refresh-admin-shares">
              ${icons.refresh}
              <span>刷新分享</span>
            </button>
            <button class="btn ${busyToken === '__cleanup__' ? 'btn-primary' : 'btn-muted'}" type="button" data-action="cleanup-expired-shares">
              ${icons.trash}
              <span>${busyToken === '__cleanup__' ? '清理中...' : '清理过期'}</span>
            </button>
          </div>
        </section>

        <section class="admin-content glass-card">
          <div class="hero-strip">
            <div class="mini-stat">
              <div class="mini-stat-label">分享总数</div>
              <div class="mini-stat-value">${safeText(totalCount, '0')}</div>
              <div class="mini-stat-meta">当前可管理的全部分享条目</div>
            </div>
            <div class="mini-stat">
              <div class="mini-stat-label">已过期</div>
              <div class="mini-stat-value">${safeText(expiredCount, '0')}</div>
              <div class="mini-stat-meta">建议定期执行过期清理</div>
            </div>
            <div class="mini-stat">
              <div class="mini-stat-label">有密码</div>
              <div class="mini-stat-value">${safeText(passwordCount, '0')}</div>
              <div class="mini-stat-meta">需要额外输入访问密码</div>
            </div>
          </div>

          ${
            admin.sharesLoading
              ? renderEmptyState('正在加载分享列表', '正在获取已创建的分享记录和访问状态。', icons.refresh)
              : admin.sharesError
                ? renderEmptyState('分享列表加载失败', admin.sharesError, icons.lock)
                : shares.length
                  ? `
                    <div class="latest-list">
                      ${shares.map(item => {
                        const token = String(item?.token || '');
                        const deleting = busyToken === token;
                        const shareLink = `${window.location.origin}/share.html?token=${encodeURIComponent(token)}`;
                        const statusBits = [
                          item?.expired ? '已过期' : '有效',
                          item?.exhausted ? '下载次数已用尽' : '可继续访问',
                          item?.hasPassword ? '有密码' : '无密码',
                        ];
                        return `
                          <article class="latest-item">
                            <div class="status-bar" style="margin-bottom:14px;">
                              <div class="status-main">
                                <span class="status-dot"></span>
                                <span>${safeText(item?.name || item?.path || token, '未命名分享')}</span>
                                <span class="toolbar-tag">${safeText(token, '-')}</span>
                              </div>
                              <div class="btn-row">
                                <button class="btn btn-muted" type="button" data-action="copy-share-link" data-key="${escapeHtml(token)}">
                                  ${icons.link}
                                  <span>复制链接</span>
                                </button>
                                <button class="btn ${deleting ? 'btn-primary' : 'btn-muted'}" type="button" data-action="delete-share" data-key="${escapeHtml(token)}">
                                  ${icons.trash}
                                  <span>${deleting ? '删除中...' : '删除分享'}</span>
                                </button>
                              </div>
                            </div>

                            <div class="admin-copy" style="margin-top:0;">
                              ${statusBits.map(text => `<span class="toolbar-tag" style="margin-right:8px;">${escapeHtml(text)}</span>`).join('')}
                            </div>

                            <div class="latest-copy" style="margin-top:12px; line-height:1.9;">
                              ${renderShareMetaLine('路径', safeText(item?.path || '/'))}
                              ${renderShareMetaLine('分享链接', `<a href="${escapeHtml(shareLink)}" target="_blank" rel="noreferrer">${escapeHtml(shareLink)}</a>`)}
                              ${renderShareMetaLine('到期时间', safeText(item?.expiresAt ? formatTime(item.expiresAt) : '不限'))}
                              ${renderShareMetaLine('自动删除', safeText(item?.autoDeleteAt ? formatTime(item.autoDeleteAt) : '未设置'))}
                              ${renderShareMetaLine('下载次数', `${safeText(item?.downloadCount || 0, '0')} / ${safeText(item?.maxDownloads || '不限', '不限')}`)}
                              ${renderShareMetaLine('预览 / 下载', `${item?.allowPreview ? '允许预览' : '禁止预览'} / ${item?.allowDownload ? '允许下载' : '禁止下载'}`)}
                              ${renderShareMetaLine('最近访问', safeText(item?.lastAccessedAt ? `${formatTime(item.lastAccessedAt)} (${formatRelative(item.lastAccessedAt)})` : '暂无'))}
                              ${renderShareMetaLine('访问 IP', safeText(item?.lastAccessIp || '暂无'))}
                            </div>
                          </article>
                        `;
                      }).join('')}
                    </div>
                  `
                  : renderEmptyState('暂无分享记录', '目前还没有创建任何分享，后续补更多功能时这里会继续扩展筛选和统计。', icons.share)
          }
        </section>
      </section>
    `;
  }

  function renderAdminPage(state) {
    const { role } = state.app;
    const admin = state.admin;

    if (role !== 'admin') {
      return `
        <section class="auth-board glass-card admin-content">
          ${renderEmptyState('需要管理员登录', '登录后即可查看文件统计、索引状态、分享记录和后续管理模块。', icons.lock)}
        </section>
      `;
    }

    return `
      <section class="admin-board">
        ${
          admin.loading
            ? renderEmptyState('正在加载概览', '正在统计文件数量、索引状态与回收站信息。', icons.stats)
            : admin.error
              ? renderEmptyState('概览加载失败', admin.error, icons.lock)
              : admin.stats
                ? renderAdminStats(admin.stats)
                : renderEmptyState('暂无概览数据', '后台接口已接通，但当前还没有可展示的概览结果。', icons.stats)
        }
        ${renderAdminShares(admin)}
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
            ${renderInfoBlock('分享 Token', safeText(share.token || '未提供'))}
            ${renderInfoBlock('访问状态', share.requiresPassword ? '需要密码' : item ? '可访问' : share.error ? '加载失败' : '等待读取')}
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
                        <p class="empty-copy">${safeText(share.error || '该分享资源启用了额外保护，输入正确密码后即可查看内容。')}</p>
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
                          <span>${safeText(item.name)} · ${safeText(item.sizeFormatted)}</span>
                        </div>
                      </div>
                      <div class="preview-stage">
                        ${renderSharePreview(share.token, item)}
                      </div>
                    `
                    : renderEmptyState('等待分享链接', '当前页面没有读取到分享 token，可通过 share.html?token=你的分享码 打开。', icons.file)
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
