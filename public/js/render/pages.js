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

  function getExpiryStatus(expiresAt) {
    if (!expiresAt) return { level: 'unlimited', label: '不限期', className: 'tag-unlimited' };
    const now = Date.now();
    const diff = expiresAt - now;
    if (diff <= 0) return { level: 'expired', label: '已过期', className: 'tag-expired' };
    const day = 86400000;
    if (diff <= 3 * day) return { level: 'soon', label: `${Math.ceil(diff / day)} 天后到期`, className: 'tag-soon' };
    return { level: 'active', label: '有效', className: 'tag-active' };
  }

  function getShareStatusTags(item) {
    const tags = [];
    const expiry = getExpiryStatus(item?.expiresAt);
    tags.push({ label: expiry.label, className: expiry.className });
    if (item?.expired) tags.push({ label: '已过期', className: 'tag-expired' });
    if (item?.hasPassword) tags.push({ label: '有密码', className: 'tag-password' });
    if (item?.allowPreview) tags.push({ label: '可预览', className: 'tag-preview' });
    else tags.push({ label: '禁止预览', className: 'tag-no-preview' });
    if (item?.allowDownload) tags.push({ label: '可下载', className: 'tag-download' });
    else tags.push({ label: '禁止下载', className: 'tag-no-download' });
    if (item?.exhausted) tags.push({ label: '次数用尽', className: 'tag-exhausted' });
    return tags;
  }

  function isShareActive(item) {
    return !item?.expired && !item?.exhausted;
  }

  function filterShares(shares, filter) {
    if (filter === 'all') return shares;
    return shares.filter(item => {
      if (!item) return false;
      switch (filter) {
        case 'active': return isShareActive(item);
        case 'expired': return item.expired;
        case 'exhausted': return item.exhausted;
        case 'password': return item.hasPassword;
        case 'preview': return item.allowPreview;
        case 'download': return item.allowDownload;
        default: return true;
      }
    });
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
              <div class="admin-status-row">
                <span class="toolbar-tag tag-active">存储正常</span>
              </div>
            </div>

            <div class="admin-card span-4">
              <div class="admin-label">回收站项目</div>
              <div class="admin-value">${safeText(stats.trash?.count || 0, '0')}</div>
              <div class="admin-copy">
                累计 ${safeText(stats.trash?.sizeFormatted, '0 B')}，约占文件总量 ${safeText(stats.trash?.percentOfFiles || 0, '0')}%。
              </div>
              <div class="admin-status-row">
                ${(stats.trash?.count || 0) > 0
                  ? '<span class="toolbar-tag tag-soon">建议清理</span>'
                  : '<span class="toolbar-tag tag-active">已清空</span>'}
              </div>
            </div>

            <div class="admin-card span-4">
              <div class="admin-label">索引状态</div>
              <div class="admin-value">${safeText(stats.index?.recommendation, '等待初始化')}</div>
              <div class="admin-copy">
                索引记录 ${safeText(stats.index?.count || 0, '0')} 条，最近更新
                ${safeText(stats.index?.latestUpdatedAt ? formatTime(stats.index.latestUpdatedAt) : '未知')}。
              </div>
              <div class="admin-status-row">
                <span class="toolbar-tag tag-active">${safeText(stats.index?.recommendation, '正常')}</span>
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
    const shareFilter = admin.shareFilter || 'all';
    const filteredShares = filterShares(shares, shareFilter);
    const totalCount = shares.length;
    const activeCount = shares.filter(item => item && !item.expired).length;
    const expiredCount = shares.filter(item => item?.expired).length;
    const passwordCount = shares.filter(item => item?.hasPassword).length;

    const filterOptions = [
      { value: 'all', label: '全部', count: totalCount },
      { value: 'active', label: '有效', count: activeCount },
      { value: 'expired', label: '已过期', count: expiredCount },
      { value: 'password', label: '有密码', count: passwordCount },
      { value: 'preview', label: '可预览', count: shares.filter(item => item?.allowPreview).length },
      { value: 'download', label: '可下载', count: shares.filter(item => item?.allowDownload).length },
    ];

    return `
      <section class="admin-frame" style="margin-top:18px;">
        <section class="admin-strip glass-card">
          <div class="status-main">
            <span class="status-dot"></span>
            <span>分享管理</span>
            <span class="toolbar-tag">${totalCount} 条记录</span>
          </div>
          <div class="btn-row admin-strip-actions">
            <button class="btn btn-muted" type="button" data-action="refresh-admin-shares">
              ${icons.refresh}
              <span>刷新分享</span>
            </button>
            <button class="btn ${busyToken === '__cleanup__' ? 'btn-primary' : 'btn-muted'}" type="button" data-action="confirm-cleanup-expired-shares">
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
              <div class="mini-stat-label">有效分享</div>
              <div class="mini-stat-value">${safeText(activeCount, '0')}</div>
              <div class="mini-stat-meta">未过期且可正常访问</div>
            </div>
            <div class="mini-stat">
              <div class="mini-stat-label">已过期</div>
              <div class="mini-stat-value">${safeText(expiredCount, '0')}</div>
              <div class="mini-stat-meta">建议定期执行过期清理</div>
            </div>
          </div>

          <div class="share-filter-bar">
            ${filterOptions.map(opt => `
              <button class="btn share-filter-btn ${shareFilter === opt.value ? 'share-filter-active' : ''}"
                      type="button"
                      data-action="set-share-filter"
                      data-filter="${escapeHtml(opt.value)}">
                ${escapeHtml(opt.label)}
                <span class="share-filter-count">${safeText(opt.count, '0')}</span>
              </button>
            `).join('')}
          </div>

          ${
            admin.sharesLoading
              ? renderEmptyState('正在加载分享列表', '正在获取已创建的分享记录和访问状态。', icons.refresh)
              : admin.sharesError
                ? renderShareErrorState(admin.sharesError)
                : shares.length === 0
                  ? renderEmptyState('暂无分享记录', '系统中还没有创建任何分享。您可以在文件管理页面选择文件并创建分享链接。', icons.share)
                  : filteredShares.length === 0
                    ? renderEmptyState('筛选结果为空', `当前筛选条件"${getFilterLabel(shareFilter)}"没有匹配的分享记录，请尝试其他筛选条件。`, icons.search)
                    : renderShareList(filteredShares, busyToken)
          }
        </section>
      </section>
    `;
  }

  function getFilterLabel(filter) {
    const labels = {
      all: '全部',
      active: '有效',
      expired: '已过期',
      password: '有密码',
      preview: '可预览',
      download: '可下载',
    };
    return labels[filter] || filter;
  }

  function renderShareErrorState(error) {
    return `
      <div class="empty-state">
        <div>
          <div class="empty-orb">${icons.lock}</div>
          <h3 class="empty-title">分享列表加载失败</h3>
          <p class="empty-copy">${escapeHtml(error)}</p>
          <div style="margin-top:18px;">
            <button class="btn btn-primary" type="button" data-action="refresh-admin-shares">
              ${icons.refresh}
              <span>重新加载</span>
            </button>
          </div>
        </div>
      </div>
    `;
  }

  function renderShareList(shares, busyToken) {
    return `
      <div class="latest-list">
        ${shares.map(item => renderShareItem(item, busyToken)).join('')}
      </div>
    `;
  }

  function renderShareItem(item, busyToken) {
    const token = String(item?.token || '');
    const deleting = busyToken === token;
    const shareLink = `${window.location.origin}/share.html?token=${encodeURIComponent(token)}`;
    const statusTags = getShareStatusTags(item);
    const expiry = getExpiryStatus(item?.expiresAt);
    const isExpired = item?.expired || expiry.level === 'expired';
    const isExpiringSoon = expiry.level === 'soon';
    const isUnlimited = expiry.level === 'unlimited';

    return `
      <article class="latest-item ${isExpired ? 'share-item-expired' : ''} ${isExpiringSoon ? 'share-item-expiring-soon' : ''}">
        <div class="status-bar" style="margin-bottom:14px;">
          <div class="status-main">
            <span class="status-dot ${isExpired ? 'status-dot-expired' : isExpiringSoon ? 'status-dot-soon' : ''}"></span>
            <span>${safeText(item?.name || item?.path || token, '未命名分享')}</span>
            <span class="toolbar-tag">${safeText(token, '-')}</span>
          </div>
          <div class="btn-row">
            <button class="btn btn-muted" type="button" data-action="copy-share-link" data-key="${escapeHtml(token)}">
              ${icons.link}
              <span>复制链接</span>
            </button>
            <button class="btn ${deleting ? 'btn-primary' : 'btn-danger'}" type="button" data-action="confirm-delete-share" data-key="${escapeHtml(token)}" data-name="${escapeHtml(item?.name || token)}">
              ${icons.trash}
              <span>${deleting ? '删除中...' : '删除分享'}</span>
            </button>
          </div>
        </div>

        <div class="share-status-tags">
          ${statusTags.map(tag => `<span class="toolbar-tag ${tag.className}">${escapeHtml(tag.label)}</span>`).join('')}
        </div>

        ${isExpiringSoon ? `
          <div class="attention-item" data-level="warning" style="margin:12px 0;">
            <h3 class="attention-title">即将到期</h3>
            <div class="attention-copy">此分享将于 ${safeText(expiry.label)}，之后将无法访问。如需继续使用，请重新创建分享。</div>
          </div>
        ` : ''}

        ${isExpired ? `
          <div class="attention-item" data-level="warning" style="margin:12px 0;">
            <h3 class="attention-title">已过期</h3>
            <div class="attention-copy">此分享已过期，无法继续访问。建议清理过期分享以释放资源。</div>
          </div>
        ` : ''}

        <div class="latest-copy" style="margin-top:12px; line-height:1.9;">
          ${renderShareMetaLine('路径', safeText(item?.path || '/'))}
          ${renderShareMetaLine('分享链接', `<a href="${escapeHtml(shareLink)}" target="_blank" rel="noreferrer">${escapeHtml(shareLink)}</a>`)}
          ${renderShareMetaLine('到期时间', isUnlimited
            ? '<span class="toolbar-tag tag-unlimited">不限期</span>'
            : safeText(item?.expiresAt ? `${formatTime(item.expiresAt)} (${expiry.label})` : '不限'))}
          ${item?.autoDeleteAt ? renderShareMetaLine('自动删除', safeText(formatTime(item.autoDeleteAt))) : ''}
          ${renderShareMetaLine('下载次数', `${safeText(item?.downloadCount || 0, '0')} / ${safeText(item?.maxDownloads || '不限', '不限')}`)}
          ${renderShareMetaLine('预览权限', item?.allowPreview ? '<span class="toolbar-tag tag-preview">允许预览</span>' : '<span class="toolbar-tag tag-no-preview">禁止预览</span>')}
          ${renderShareMetaLine('下载权限', item?.allowDownload ? '<span class="toolbar-tag tag-download">允许下载</span>' : '<span class="toolbar-tag tag-no-download">禁止下载</span>')}
          ${renderShareMetaLine('最近访问', safeText(item?.lastAccessedAt ? `${formatTime(item.lastAccessedAt)} (${formatRelative(item.lastAccessedAt)})` : '暂无'))}
          ${renderShareMetaLine('访问 IP', safeText(item?.lastAccessIp || '暂无'))}
        </div>
      </article>
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
              ? renderAdminErrorState(admin.error)
              : admin.stats
                ? renderAdminStats(admin.stats)
                : renderEmptyState('暂无概览数据', '后台接口已接通，但当前还没有可展示的概览结果。', icons.stats)
        }
        ${renderAdminShares(admin)}
      </section>
    `;
  }

  function renderAdminErrorState(error) {
    return `
      <div class="empty-state">
        <div>
          <div class="empty-orb">${icons.lock}</div>
          <h3 class="empty-title">概览加载失败</h3>
          <p class="empty-copy">${escapeHtml(error)}</p>
          <div style="margin-top:18px;">
            <button class="btn btn-primary" type="button" data-action="refresh-admin">
              ${icons.refresh}
              <span>重新加载</span>
            </button>
          </div>
        </div>
      </div>
    `;
  }

  function renderSharePreview(token, item) {
    if (!item.allowPreview) {
      return renderEmptyState('预览已关闭', '当前分享仅允许下载，不开放在线预览。', icons.lock);
    }

    if (item.mockPreviewHtml) {
      return item.mockPreviewHtml;
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
