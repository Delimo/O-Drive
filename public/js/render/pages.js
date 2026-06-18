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
    const isActive = isShareActive(item);
    const expiry = getExpiryStatus(item?.expiresAt);
    if (isActive) {
      tags.push({ label: '有效', className: 'tag-active' });
    } else if (item?.expired) {
      tags.push({ label: '已过期', className: 'tag-expired' });
    } else if (item?.exhausted) {
      tags.push({ label: '次数用尽', className: 'tag-exhausted' });
    } else {
      tags.push({ label: expiry.label, className: expiry.className });
    }
    if (item?.hasPassword) tags.push({ label: '有密码', className: 'tag-password' });
    if (item?.allowPreview) tags.push({ label: '可预览', className: 'tag-preview' });
    else tags.push({ label: '禁止预览', className: 'tag-no-preview' });
    if (item?.allowDownload) tags.push({ label: '可下载', className: 'tag-download' });
    else tags.push({ label: '禁止下载', className: 'tag-no-download' });
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

  function getFilterLabel(filter) {
    const labels = {
      all: '全部',
      active: '有效',
      expired: '已过期',
      exhausted: '次数用尽',
      password: '有密码',
      preview: '可预览',
      download: '可下载',
    };
    return labels[filter] || filter;
  }

  function getShareFilterOptions(shares) {
    return [
      { value: 'all', label: '全部', count: shares.length },
      { value: 'active', label: '有效', count: shares.filter(item => isShareActive(item)).length },
      { value: 'expired', label: '已过期', count: shares.filter(item => item?.expired).length },
      { value: 'exhausted', label: '次数用尽', count: shares.filter(item => item?.exhausted).length },
      { value: 'password', label: '有密码', count: shares.filter(item => item?.hasPassword).length },
      { value: 'preview', label: '可预览', count: shares.filter(item => item?.allowPreview).length },
      { value: 'download', label: '可下载', count: shares.filter(item => item?.allowDownload).length },
    ];
  }

  function renderAdminOverviewStrip(admin) {
    const recommendation = safeText(admin.stats?.index?.recommendation, '正常');
    return `
      <section class="toolbar glass-card page-bar admin-bar">
        <div class="toolbar-left admin-toolbar-main">
          <div class="status-main">
            <span class="status-dot"></span>
            <span>后台概览</span>
            <span class="toolbar-tag">统一三段式后台</span>
          </div>
        </div>
        <div class="toolbar-right admin-toolbar-actions">
          <span class="toolbar-tag">${recommendation}</span>
          <button class="btn toolbar-btn" type="button" data-action="refresh-admin">
            ${icons.refresh}
            <span>刷新概览</span>
          </button>
          <button class="btn toolbar-btn" type="button" data-action="refresh-admin-shares">
            ${icons.share}
            <span>刷新分享</span>
          </button>
          <button class="btn toolbar-btn" type="button" data-action="refresh-admin-health">
            ${icons.eye}
            <span>健康检查</span>
          </button>
          <button class="btn toolbar-btn" type="button" data-action="refresh-admin-logs">
            ${icons.list}
            <span>操作日志</span>
          </button>
          <button class="btn toolbar-btn" type="button" data-action="refresh-admin-quota">
            ${icons.stats}
            <span>存储配额</span>
          </button>
          <button class="btn toolbar-btn" type="button" data-action="refresh-admin-protected-paths">
            ${icons.lock}
            <span>受保护路径</span>
          </button>
          <button class="btn toolbar-btn" type="button" data-action="refresh-admin-hidden-paths">
            ${icons.eye}
            <span>隐藏路径</span>
          </button>
          <button class="btn toolbar-btn" type="button" data-action="refresh-admin-storage-config">
            ${icons.stats}
            <span>存储空间</span>
          </button>
          <button class="btn toolbar-btn" type="button" data-action="refresh-admin-webhooks">
            ${icons.link}
            <span>Webhook</span>
          </button>
          <button class="btn toolbar-btn" type="button" data-action="refresh-admin-webhook-deliveries">
            ${icons.list}
            <span>投递记录</span>
          </button>
          <button class="btn toolbar-btn" type="button" data-action="refresh-admin-maintenance">
            ${icons.refresh}
            <span>维护操作</span>
          </button>
        </div>
      </section>
    `;
  }

  function renderAdminControlStrip(admin) {
    const shares = admin.shares || [];
    const busyToken = admin.shareBusyToken || '';
    const shareFilter = admin.shareFilter || 'all';
    const filterOptions = getShareFilterOptions(shares);

    return `
      <section class="toolbar glass-card page-bar admin-bar admin-bar-secondary">
        <div class="toolbar-left admin-toolbar-main">
          <div class="status-main">
            <span class="status-dot"></span>
            <span>分享管理</span>
            <span class="toolbar-tag">${safeText(shares.length, '0')} 条记录</span>
          </div>
        </div>
        <div class="toolbar-right admin-toolbar-stack">
          <div class="btn-row admin-strip-actions">
            <button class="btn toolbar-btn" type="button" data-action="confirm-cleanup-expired-shares">
              ${icons.trash}
              <span>${busyToken === '__cleanup__' ? '清理中...' : '清理过期'}</span>
            </button>
          </div>
          <div class="share-filter-bar admin-filter-bar">
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
        </div>
      </section>
    `;
  }

  function renderAdminStatsGrid(stats) {
    const breakdown = Object.entries(stats.breakdown || {});
    const latest = stats.latest || [];
    const attention = stats.attention || [];

    return `
      <div class="admin-grid">
        <div class="admin-card span-4">
          <div class="admin-label">文件总数</div>
          <div class="admin-value">${safeText(stats.files?.count || 0, '0')}</div>
          <div class="admin-copy">
            总容量 ${safeText(stats.files?.totalSizeFormatted, '0 B')}，文件夹标记 ${safeText(stats.files?.folderMarkers || 0, '0')}。
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
    `;
  }

  function renderAdminSharesSection(admin) {
    const shares = admin.shares || [];
    const busyToken = admin.shareBusyToken || '';
    const shareFilter = admin.shareFilter || 'all';
    const filteredShares = filterShares(shares, shareFilter);
    const expiredCount = shares.filter(item => item?.expired).length;
    const exhaustedCount = shares.filter(item => item?.exhausted).length;

    return `
      <section class="admin-section">
        <div class="admin-section-head">
          <div>
            <h2 class="admin-section-title">分享总览</h2>
            <p class="admin-section-copy">用统一的三段式结构管理分享状态、筛选条件与访问记录。</p>
          </div>
        </div>
        <div class="hero-strip">
          <div class="mini-stat">
            <div class="mini-stat-label">分享总数</div>
            <div class="mini-stat-value">${safeText(shares.length, '0')}</div>
            <div class="mini-stat-meta">当前可管理的全部分享条目</div>
          </div>
          <div class="mini-stat">
            <div class="mini-stat-label">有效分享</div>
            <div class="mini-stat-value">${safeText(shares.filter(item => isShareActive(item)).length, '0')}</div>
            <div class="mini-stat-meta">未过期且次数未用尽</div>
          </div>
          <div class="mini-stat">
            <div class="mini-stat-label">已失效</div>
            <div class="mini-stat-value">${safeText(expiredCount + exhaustedCount, '0')}</div>
            <div class="mini-stat-meta">已过期 ${expiredCount} · 次数用尽 ${exhaustedCount}</div>
          </div>
        </div>
        ${
          admin.sharesLoading
            ? renderEmptyState('正在加载分享列表', '正在获取已创建的分享记录和访问状态。', icons.refresh)
            : admin.sharesError
              ? renderShareErrorState(admin.sharesError)
              : shares.length === 0
                ? renderEmptyState('暂无分享记录', '系统中还没有创建任何分享。您可以在文件管理页面选择文件并创建分享链接。', icons.share)
                : filteredShares.length === 0
                  ? renderEmptyState('筛选结果为空', `当前筛选条件“${getFilterLabel(shareFilter)}”没有匹配的分享记录，请尝试其他筛选条件。`, icons.search)
                  : renderShareList(filteredShares, busyToken)
        }
      </section>
    `;
  }

  function renderAdminHealthSection(admin) {
    const health = admin.health;
    const loading = admin.healthLoading;
    const error = admin.healthError;

    if (error) {
      return `
        <section class="admin-section">
          <div class="admin-section-head">
            <div><h2 class="admin-section-title">系统健康</h2></div>
            <button class="btn toolbar-btn" type="button" data-action="refresh-admin-health">${icons.eye}<span>重新加载</span></button>
          </div>
          <div class="empty-state">
            <div class="empty-orb">${icons.lock}</div>
            <p class="empty-copy">${escapeHtml(error)}</p>
          </div>
        </section>
      `;
    }

    if (loading || !health) {
      return `
        <section class="admin-section">
          <div class="admin-section-head">
            <div><h2 class="admin-section-title">系统健康</h2></div>
            <button class="btn toolbar-btn" type="button" data-action="refresh-admin-health">${icons.eye}<span>刷新</span></button>
          </div>
          ${renderEmptyState('加载中', '正在检查各服务组件运行状态...', icons.eye)}
        </section>
      `;
    }

    const items = Object.entries(health.components || health).filter(([, v]) => typeof v === 'object');
    return `
      <section class="admin-section">
        <div class="admin-section-head">
          <div>
            <h2 class="admin-section-title">系统健康</h2>
            <p class="admin-section-copy">各服务组件运行状态一览。</p>
          </div>
          <button class="btn toolbar-btn" type="button" data-action="refresh-admin-health">${icons.eye}<span>刷新</span></button>
        </div>
        <div class="hero-strip">
          ${items.map(([key, value]) => {
            const status = String(value?.status || 'unknown');
            const ok = status === 'ok' || status === 'healthy';
            return `
              <div class="mini-stat">
                <div class="mini-stat-label">${safeText(key)}</div>
                <div class="mini-stat-value">${ok ? icons.check : icons.close}</div>
                <div class="mini-stat-meta">${safeText(value?.message || status, '未知')}</div>
              </div>
            `;
          }).join('')}
        </div>
      </section>
    `;
  }

  function renderAdminLogsSection(admin) {
    const { logs, logsLoading, logsError, logsPage, logsTotalPages, logsFilter } = admin;

    if (logsError) {
      return `
        <section class="admin-section">
          <div class="admin-section-head">
            <div><h2 class="admin-section-title">操作日志</h2></div>
            <button class="btn toolbar-btn" type="button" data-action="refresh-admin-logs">${icons.refresh}<span>重新加载</span></button>
          </div>
          <div class="empty-state">
            <div class="empty-orb">${icons.lock}</div>
            <p class="empty-copy">${escapeHtml(logsError)}</p>
          </div>
        </section>
      `;
    }

    return `
      <section class="admin-section">
        <div class="admin-section-head">
          <div>
            <h2 class="admin-section-title">操作日志</h2>
            <p class="admin-section-copy">查看系统操作记录，支持按关键字筛选和分页浏览。</p>
          </div>
          <button class="btn toolbar-btn" type="button" data-action="refresh-admin-logs">${icons.refresh}<span>刷新</span></button>
        </div>
        <div class="admin-filter-bar" style="margin-bottom:14px;">
          <input class="input" type="text" placeholder="搜索关键字..." value="${escapeHtml(logsFilter.q || '')}" data-action-input="set-logs-filter" data-key="q" style="flex:1;min-width:120px;">
          <select class="input" data-action-change="set-logs-filter" data-key="action" style="width:auto;">
            <option value="">全部类型</option>
            <option value="create" ${logsFilter.action === 'create' ? 'selected' : ''}>创建</option>
            <option value="delete" ${logsFilter.action === 'delete' ? 'selected' : ''}>删除</option>
            <option value="update" ${logsFilter.action === 'update' ? 'selected' : ''}>更新</option>
            <option value="share" ${logsFilter.action === 'share' ? 'selected' : ''}>分享</option>
            <option value="login" ${logsFilter.action === 'login' ? 'selected' : ''}>登录</option>
            <option value="upload" ${logsFilter.action === 'upload' ? 'selected' : ''}>上传</option>
          </select>
        </div>
        ${
          logsLoading
            ? renderEmptyState('正在加载日志', '正在获取系统操作记录。', icons.refresh)
            : logs.length === 0
              ? renderEmptyState('暂无操作日志', '系统中还没有操作记录。', icons.list)
              : `
                <div class="latest-list">
                  ${logs.map(item => `
                    <article class="latest-item">
                      <div class="latest-title">${safeText(item.action || '操作')} · ${safeText(item.path || '/')}</div>
                      <div class="latest-copy">
                        ${item.user ? `用户 ${escapeHtml(item.user)}` : ''}
                        ${item.ip ? ` · IP ${escapeHtml(item.ip)}` : ''}
                        ${item.createdAt ? ` · ${formatTime(item.createdAt)} (${formatRelative(item.createdAt)})` : ''}
                      </div>
                      ${item.detail ? `<div class="latest-copy" style="margin-top:4px;color:var(--muted);font-size:13px;">${escapeHtml(item.detail)}</div>` : ''}
                    </article>
                  `).join('')}
                </div>
                <div class="admin-pagination" style="display:flex;align-items:center;gap:8px;margin-top:16px;">
                  <button class="btn btn-muted" type="button" data-action="set-logs-page" data-page="${logsPage - 1}" ${logsPage <= 1 ? 'disabled' : ''}>上一页</button>
                  <span style="font-size:13px;color:var(--muted);">第 ${logsPage} / ${logsTotalPages || 1} 页</span>
                  <button class="btn btn-muted" type="button" data-action="set-logs-page" data-page="${logsPage + 1}" ${logsPage >= logsTotalPages ? 'disabled' : ''}>下一页</button>
                </div>
              `
        }
      </section>
    `;
  }

  function renderAdminQuotaSection(admin) {
    const { quota, quotaLoading, quotaError } = admin;

    if (quotaError) {
      return `
        <section class="admin-section">
          <div class="admin-section-head">
            <div><h2 class="admin-section-title">存储配额</h2></div>
            <button class="btn toolbar-btn" type="button" data-action="refresh-admin-quota">${icons.refresh}<span>重新加载</span></button>
          </div>
          <div class="empty-state">
            <div class="empty-orb">${icons.lock}</div>
            <p class="empty-copy">${escapeHtml(quotaError)}</p>
          </div>
        </section>
      `;
    }

    if (quotaLoading || !quota) {
      return `
        <section class="admin-section">
          <div class="admin-section-head">
            <div><h2 class="admin-section-title">存储配额</h2></div>
            <button class="btn toolbar-btn" type="button" data-action="refresh-admin-quota">${icons.refresh}<span>刷新</span></button>
          </div>
          ${renderEmptyState('加载中', '正在获取存储配额信息...', icons.stats)}
        </section>
      `;
    }

    const usedFormatted = formatBytes(quota.used || 0);
    const totalFormatted = formatBytes(quota.total || quota.limit || 0);
    const pct = quota.used && (quota.total || quota.limit)
      ? Math.round((quota.used / (quota.total || quota.limit)) * 100)
      : 0;

    return `
      <section class="admin-section">
        <div class="admin-section-head">
          <div>
            <h2 class="admin-section-title">存储配额</h2>
            <p class="admin-section-copy">已用 ${usedFormatted} / ${totalFormatted}（${pct}%）</p>
          </div>
          <button class="btn toolbar-btn" type="button" data-action="refresh-admin-quota">${icons.refresh}<span>刷新</span></button>
        </div>
        <div class="hero-strip">
          <div class="mini-stat">
            <div class="mini-stat-label">已用空间</div>
            <div class="mini-stat-value">${usedFormatted}</div>
            <div class="mini-stat-meta">占总额的 ${pct}%</div>
          </div>
          <div class="mini-stat">
            <div class="mini-stat-label">总配额</div>
            <div class="mini-stat-value">${totalFormatted}</div>
            <div class="mini-stat-meta">${quota.count ? `共 ${quota.count} 个文件` : ''}</div>
          </div>
        </div>
      </section>
    `;
  }

  function renderAdminProtectedPathsSection(admin) {
    const { protectedPaths, protectedPathsLoading, protectedPathsError } = admin;

    return `
      <section class="admin-section">
        <div class="admin-section-head">
          <div>
            <h2 class="admin-section-title">受保护路径</h2>
            <p class="admin-section-copy">设置需要密码才能访问的文件夹，增强数据安全。</p>
          </div>
          <div class="btn-row">
            <button class="btn toolbar-btn" type="button" data-action="refresh-admin-protected-paths">${icons.refresh}<span>刷新</span></button>
            <button class="btn btn-primary toolbar-btn" type="button" data-action="show-add-protected-path">${icons.plus}<span>添加路径</span></button>
          </div>
        </div>
        ${
          protectedPathsLoading
            ? renderEmptyState('正在加载受保护路径', '正在获取路径列表。', icons.lock)
            : protectedPathsError
              ? `
                <div class="empty-state">
                  <div class="empty-orb">${icons.lock}</div>
                  <p class="empty-copy">${escapeHtml(protectedPathsError)}</p>
                </div>
              `
              : protectedPaths.length === 0
                ? renderEmptyState('暂无受保护路径', '还没有设置任何受保护路径。点击上方按钮添加。', icons.lock)
                : `
                  <div class="latest-list">
                    ${protectedPaths.map(item => {
                      const path = String(item?.path || item?.folder || '/');
                      const note = item?.note || '';
                      const showName = item?.showName || '';
                      return `
                        <article class="latest-item">
                          <div class="status-bar" style="margin-bottom:8px;">
                            <div class="status-main">
                              <span class="status-dot"></span>
                              <span>${safeText(showName || path)}</span>
                              <span class="toolbar-tag">${safeText(path)}</span>
                            </div>
                            <button class="btn btn-danger" type="button" data-action="confirm-delete-protected-path" data-path="${escapeHtml(path)}">
                              ${icons.trash}<span>删除</span>
                            </button>
                          </div>
                          ${note ? `<div class="latest-copy">${escapeHtml(note)}</div>` : ''}
                        </article>
                      `;
                    }).join('')}
                  </div>
                `
        }
      </section>
    `;
  }

  function renderAdminHiddenPathsSection(admin) {
    const { hiddenPaths, hiddenPathsLoading, hiddenPathsError } = admin;

    return `
      <section class="admin-section">
        <div class="admin-section-head">
          <div>
            <h2 class="admin-section-title">隐藏路径</h2>
            <p class="admin-section-copy">被隐藏的路径对游客不可见，管理员仍可正常访问。</p>
          </div>
          <div class="btn-row">
            <button class="btn toolbar-btn" type="button" data-action="refresh-admin-hidden-paths">${icons.refresh}<span>刷新</span></button>
            <button class="btn btn-primary toolbar-btn" type="button" data-action="show-add-hidden-path">${icons.plus}<span>添加路径</span></button>
          </div>
        </div>
        ${
          hiddenPathsLoading
            ? renderEmptyState('正在加载隐藏路径', '正在获取隐藏路径列表。', icons.eye)
            : hiddenPathsError
              ? `
                <div class="empty-state">
                  <div class="empty-orb">${icons.eye}</div>
                  <p class="empty-copy">${escapeHtml(hiddenPathsError)}</p>
                </div>
              `
              : hiddenPaths.length === 0
                ? renderEmptyState('暂无隐藏路径', '还没有设置任何隐藏路径。点击上方按钮添加。', icons.eye)
                : `
                  <div class="latest-list">
                    ${hiddenPaths.map(item => {
                      const path = String(item?.path || '/');
                      return `
                        <article class="latest-item">
                          <div class="status-bar" style="margin-bottom:8px;">
                            <div class="status-main">
                              <span class="status-dot"></span>
                              <span>${safeText(path)}</span>
                            </div>
                            <button class="btn btn-danger" type="button" data-action="confirm-delete-hidden-path" data-path="${escapeHtml(path)}">
                              ${icons.trash}<span>取消隐藏</span>
                            </button>
                          </div>
                        </article>
                      `;
                    }).join('')}
                  </div>
                `
        }
      </section>
    `;
  }

  function renderAdminStorageSection(admin) {
    const { storageConfig, storageConfigLoading, storageConfigError, storageConfigSaving } = admin;

    if (storageConfigError) {
      return `
        <section class="admin-section">
          <div class="admin-section-head">
            <div><h2 class="admin-section-title">存储空间</h2></div>
            <button class="btn toolbar-btn" type="button" data-action="refresh-admin-storage-config">${icons.refresh}<span>重新加载</span></button>
          </div>
          <div class="empty-state">
            <div class="empty-orb">${icons.stats}</div>
            <p class="empty-copy">${escapeHtml(storageConfigError)}</p>
          </div>
        </section>
      `;
    }

    if (storageConfigLoading || !storageConfig) {
      return `
        <section class="admin-section">
          <div class="admin-section-head">
            <div><h2 class="admin-section-title">存储空间</h2></div>
            <button class="btn toolbar-btn" type="button" data-action="refresh-admin-storage-config">${icons.refresh}<span>刷新</span></button>
          </div>
          ${renderEmptyState('加载中', '正在加载存储空间配置...', icons.stats)}
        </section>
      `;
    }

    const r2 = storageConfig.r2 || {};
    const spaces = storageConfig.spaces || [];
    const bindings = storageConfig.bindings || [];
    const usagePercent = r2.usedPercent || 0;
    const usageBarColor = usagePercent >= 90 ? 'var(--danger)' : usagePercent >= 75 ? 'var(--warning)' : 'var(--primary)';

    return `
      <section class="admin-section">
        <div class="admin-section-head">
          <div>
            <h2 class="admin-section-title">存储空间</h2>
            <p class="admin-section-copy">管理 R2 与 S3 兼容存储空间及路径绑定。</p>
          </div>
          <div class="btn-row">
            <button class="btn toolbar-btn" type="button" data-action="refresh-admin-storage-config" ${storageConfigSaving ? 'disabled' : ''}>${icons.refresh}<span>刷新</span></button>
          </div>
        </div>

        <div class="admin-grid">
          <div class="admin-card span-6">
            <div class="mini-stat">
              <div class="mini-stat-label">${escapeHtml(r2.name || 'Cloudflare R2')}</div>
              <div class="mini-stat-value">${escapeHtml(r2.usedFormatted || '0')} / ${escapeHtml(r2.quotaFormatted || '未设置')}</div>
              <div style="margin:8px 0;height:6px;background:var(--border);border-radius:3px;overflow:hidden;">
                <div style="height:100%;width:${Math.min(usagePercent, 100)}%;background:${usageBarColor};border-radius:3px;transition:width .3s;"></div>
              </div>
              <div class="mini-stat-meta">已用 ${usagePercent}%</div>
            </div>
            <div class="btn-row" style="margin-top:8px;">
              <button class="btn toolbar-btn" type="button" data-action="show-edit-storage-quota" ${storageConfigSaving ? 'disabled' : ''}>${icons.edit}<span>编辑配额</span></button>
            </div>
          </div>

          <div class="admin-card span-6">
            <div class="mini-stat">
              <div class="mini-stat-label">溢出策略</div>
              <div class="mini-stat-value">${storageConfig.overflowEnabled ? '已启用' : '已禁用'}</div>
              <div class="mini-stat-meta">阈值：${storageConfig.overflowThresholdPercent || 85}%</div>
            </div>
          </div>
        </div>

        <div class="admin-section-head" style="margin-top:24px;">
          <div>
            <h3 class="admin-section-title" style="font-size:18px;">S3 存储空间</h3>
          </div>
          <div class="btn-row">
            <button class="btn btn-primary toolbar-btn" type="button" data-action="show-add-storage-space" ${storageConfigSaving ? 'disabled' : ''}>${icons.plus}<span>添加空间</span></button>
          </div>
        </div>
        ${
          spaces.length === 0
            ? renderEmptyState('暂无 S3 空间', '还没有配置任何外部存储空间。', icons.stats)
            : `
              <div class="latest-list">
                ${spaces.map(item => {
                  const pct = item.usedPercent || 0;
                  const barColor = pct >= 90 ? 'var(--danger)' : pct >= 75 ? 'var(--warning)' : 'var(--primary)';
                  return `
                    <article class="latest-item">
                      <div class="status-bar" style="margin-bottom:4px;">
                        <div class="status-main">
                          <span class="status-dot" style="background:${item.enabled ? 'var(--primary)' : 'var(--muted)'}"></span>
                          <span>${safeText(item.name)}</span>
                          <span class="toolbar-tag">${safeText(item.bucket)}</span>
                          ${!item.enabled ? '<span class="toolbar-tag tag-expired">已禁用</span>' : ''}
                          ${item.overflowTarget ? '<span class="toolbar-tag tag-unlimited">溢出目标</span>' : ''}
                        </div>
                        <div class="btn-row">
                          <button class="btn toolbar-btn" type="button" data-action="test-storage-space" data-id="${escapeHtml(item.id)}" ${storageConfigSaving ? 'disabled' : ''}>${icons.eye}<span>测试</span></button>
                          <button class="btn btn-danger" type="button" data-action="confirm-delete-storage-space" data-id="${escapeHtml(item.id)}" data-name="${escapeHtml(item.name)}" ${storageConfigSaving ? 'disabled' : ''}>${icons.trash}<span>删除</span></button>
                        </div>
                      </div>
                      <div style="font-size:13px;color:var(--muted);">
                        ${escapeHtml(item.usedFormatted || '0')} / ${escapeHtml(item.quotaFormatted || '未设置')}
                        <span style="margin:0 8px;">·</span>
                        <span style="color:${barColor};">${pct}%</span>
                        <span style="margin:0 8px;">·</span>
                        ${escapeHtml(item.endpoint || 'N/A')}
                      </div>
                    </article>
                  `;
                }).join('')}
              </div>
            `
        }

        <div class="admin-section-head" style="margin-top:24px;">
          <div>
            <h3 class="admin-section-title" style="font-size:18px;">路径绑定</h3>
          </div>
          <div class="btn-row">
            <button class="btn btn-primary toolbar-btn" type="button" data-action="show-add-storage-binding" ${storageConfigSaving ? 'disabled' : ''}>${icons.plus}<span>添加绑定</span></button>
          </div>
        </div>
        ${
          bindings.length === 0
            ? renderEmptyState('暂无路径绑定', '还没有配置任何路径与存储空间的绑定。', icons.link)
            : `
              <div class="latest-list">
                ${bindings.map(item => {
                  const storageName = item.storageId === 'r2' ? 'Cloudflare R2' : (spaces.find(s => s.id === item.storageId)?.name || item.storageId);
                  return `
                    <article class="latest-item">
                      <div class="status-bar" style="margin-bottom:4px;">
                        <div class="status-main">
                          <span class="status-dot"></span>
                          <span>${safeText(item.path)}</span>
                          <span class="toolbar-tag">${escapeHtml(storageName)}</span>
                        </div>
                        <button class="btn btn-danger" type="button" data-action="confirm-delete-storage-binding" data-path="${escapeHtml(item.path)}" ${storageConfigSaving ? 'disabled' : ''}>
                          ${icons.trash}<span>删除</span>
                        </button>
                      </div>
                    </article>
                  `;
                }).join('')}
              </div>
            `
        }
      </section>
    `;
  }

  function renderAdminWebhooksSection(admin) {
    const { webhooks, webhooksLoading, webhooksError } = admin;

    if (webhooksError) {
      return `
        <section class="admin-section">
          <div class="admin-section-head">
            <div><h2 class="admin-section-title">Webhook 配置</h2></div>
            <button class="btn toolbar-btn" type="button" data-action="refresh-admin-webhooks">${icons.refresh}<span>重新加载</span></button>
          </div>
          <div class="empty-state">
            <div class="empty-orb">${icons.link}</div>
            <p class="empty-copy">${escapeHtml(webhooksError)}</p>
          </div>
        </section>
      `;
    }

    if (webhooksLoading) {
      return `
        <section class="admin-section">
          <div class="admin-section-head">
            <div><h2 class="admin-section-title">Webhook 配置</h2></div>
            <button class="btn toolbar-btn" type="button" data-action="refresh-admin-webhooks">${icons.refresh}<span>刷新</span></button>
          </div>
          ${renderEmptyState('加载中', '正在加载 Webhook 配置...', icons.link)}
        </section>
      `;
    }

    return `
      <section class="admin-section">
        <div class="admin-section-head">
          <div>
            <h2 class="admin-section-title">Webhook 配置</h2>
            <p class="admin-section-copy">配置事件通知的投递端点，支持 JSON / Text / Markdown 格式。</p>
          </div>
          <div class="btn-row">
            <button class="btn toolbar-btn" type="button" data-action="refresh-admin-webhooks">${icons.refresh}<span>刷新</span></button>
            <button class="btn btn-primary toolbar-btn" type="button" data-action="show-add-webhook">${icons.plus}<span>添加 Webhook</span></button>
          </div>
        </div>
        ${
          webhooks.length === 0
            ? renderEmptyState('暂无 Webhook', '还没有配置任何 Webhook。添加后可在文件操作或管理事件时收到通知。', icons.link)
            : `
              <div class="latest-list">
                ${webhooks.map(item => `
                  <article class="latest-item">
                    <div class="status-bar" style="margin-bottom:4px;">
                      <div class="status-main">
                        <span class="status-dot" style="background:${item.enabled ? 'var(--primary)' : 'var(--muted)'}"></span>
                        <span>${safeText(item.name)}</span>
                        <span class="toolbar-tag">${safeText(item.msgtype)}</span>
                        <span class="toolbar-tag">${safeText(item.method)}</span>
                        ${!item.enabled ? '<span class="toolbar-tag tag-expired">已禁用</span>' : ''}
                      </div>
                      <div class="btn-row">
                        <button class="btn toolbar-btn" type="button" data-action="test-webhook" data-id="${escapeHtml(item.id)}">${icons.eye}<span>测试</span></button>
                        <button class="btn toolbar-btn" type="button" data-action="edit-webhook" data-id="${escapeHtml(item.id)}">${icons.edit}<span>编辑</span></button>
                        <button class="btn btn-danger" type="button" data-action="confirm-delete-webhook" data-id="${escapeHtml(item.id)}" data-name="${escapeHtml(item.name)}">${icons.trash}<span>删除</span></button>
                      </div>
                    </div>
                    <div style="font-size:13px;color:var(--muted);">
                      ${escapeHtml(item.url)}
                      <span style="margin:0 8px;">·</span>
                      ${(item.events || []).map(e => `<span class="toolbar-tag">${escapeHtml(e)}</span>`).join(' ')}
                    </div>
                  </article>
                `).join('')}
              </div>
            `
        }
      </section>
    `;
  }

  function renderAdminWebhookDeliveriesSection(admin) {
    const { webhookDeliveries, webhookDeliveriesLoading } = admin;

    return `
      <section class="admin-section">
        <div class="admin-section-head">
          <div>
            <h2 class="admin-section-title">Webhook 投递记录</h2>
            <p class="admin-section-copy">最近 20 条投递记录，包括成功和失败。</p>
          </div>
          <button class="btn toolbar-btn" type="button" data-action="refresh-admin-webhook-deliveries">${icons.refresh}<span>刷新</span></button>
        </div>
        ${
          webhookDeliveriesLoading
            ? renderEmptyState('加载中', '正在加载投递记录...', icons.list)
            : webhookDeliveries.length === 0
              ? renderEmptyState('暂无投递记录', '还没有任何 Webhook 投递记录。', icons.list)
              : `
                <div class="latest-list">
                  ${webhookDeliveries.map(item => {
                    const ok = item.ok === 1 || item.ok === true;
                    return `
                      <article class="latest-item">
                        <div class="status-bar" style="margin-bottom:4px;">
                          <div class="status-main">
                            <span class="status-dot" style="background:${ok ? 'var(--primary)' : 'var(--danger)'}"></span>
                            <span>${safeText(item.event)}</span>
                            <span class="toolbar-tag">${safeText(item.endpoint)}</span>
                            <span class="toolbar-tag ${ok ? 'tag-unlimited' : 'tag-expired'}">${ok ? '成功' : '失败'}</span>
                          </div>
                        </div>
                        <div style="font-size:13px;color:var(--muted);">
                          ${ok ? `<span>HTTP ${escapeHtml(String(item.status))}</span>` : `<span>${escapeHtml(item.error || '未知错误')}</span>`}
                          <span style="margin:0 8px;">·</span>
                          <span>${escapeHtml(item.duration_ms || 0)}ms</span>
                          <span style="margin:0 8px;">·</span>
                          <span>${escapeHtml(formatRelative(item.created_at) || '')}</span>
                        </div>
                      </article>
                    `;
                  }).join('')}
                </div>
              `
        }
      </section>
    `;
  }

  const MAINTENANCE_ACTIONS = [
    { action: 'rebuild-index', label: '重建文件索引', desc: '从 R2 存储重新扫描并同步文件索引表，修复索引与存储不一致的问题。', danger: false },
    { action: 'cleanup-access-attempts', label: '清理访问记录', desc: '删除所有路径访问失败记录，释放数据库空间。', danger: false },
    { action: 'cleanup-thumbnails', label: '清理缩略图缓存', desc: '删除 R2 中所有缩略图缓存对象，释放存储空间。', danger: false },
    { action: 'cleanup-logs', label: '清理旧操作日志', desc: '删除超过保留期限的操作日志记录，释放数据库空间。', danger: false },
    { action: 'cleanup-tasks', label: '清理已完成任务', desc: '删除所有已完成的后台文件任务记录，释放数据库空间。', danger: false },
    { action: 'cleanup-warnings', label: '确认系统提醒', desc: '将所有未确认的系统提醒标记为已确认，清除提醒标记。', danger: false },
  ];

  function renderAdminMaintenanceSection(admin) {
    const { maintenance, maintenanceLoading, maintenanceError, maintenanceBusyAction } = admin;

    if (maintenanceError) {
      return `
        <section class="admin-section">
          <div class="admin-section-head">
            <div><h2 class="admin-section-title">维护操作</h2></div>
            <button class="btn toolbar-btn" type="button" data-action="refresh-admin-maintenance">${icons.refresh}<span>重新加载</span></button>
          </div>
          <div class="empty-state">
            <div class="empty-orb">${icons.lock}</div>
            <p class="empty-copy">${escapeHtml(maintenanceError)}</p>
          </div>
        </section>
      `;
    }

    if (maintenanceLoading || !maintenance) {
      return `
        <section class="admin-section">
          <div class="admin-section-head">
            <div><h2 class="admin-section-title">维护操作</h2></div>
            <button class="btn toolbar-btn" type="button" data-action="refresh-admin-maintenance">${icons.refresh}<span>刷新</span></button>
          </div>
          ${renderEmptyState('加载中', '正在获取系统维护快照...', icons.refresh)}
        </section>
      `;
    }

    return `
      <section class="admin-section">
        <div class="admin-section-head">
          <div>
            <h2 class="admin-section-title">维护操作</h2>
            <p class="admin-section-copy">系统维护快照与一键操作，所有操作均记录到操作日志。</p>
          </div>
          <button class="btn toolbar-btn" type="button" data-action="refresh-admin-maintenance">${icons.refresh}<span>刷新</span></button>
        </div>
        <div class="hero-strip">
          <div class="mini-stat">
            <div class="mini-stat-label">索引记录</div>
            <div class="mini-stat-value">${safeText(maintenance.indexCount, '0')}</div>
            <div class="mini-stat-meta">${safeText(maintenance.indexTotalSizeFormatted, '0 B')}${maintenance.indexFresh ? ' · 同步中' : ' · 待同步'}</div>
          </div>
          <div class="mini-stat">
            <div class="mini-stat-label">R2 对象</div>
            <div class="mini-stat-value">${safeText(maintenance.r2SampleCount, '0')}</div>
            <div class="mini-stat-meta">${maintenance.r2SampleTruncated ? '超 1000 条' : '可见对象数'}</div>
          </div>
          <div class="mini-stat">
            <div class="mini-stat-label">访问记录</div>
            <div class="mini-stat-value">${safeText(maintenance.accessAttemptCount, '0')}</div>
            <div class="mini-stat-meta">失败记录数</div>
          </div>
          <div class="mini-stat">
            <div class="mini-stat-label">回收站</div>
            <div class="mini-stat-value">${safeText(maintenance.trashCount, '0')}</div>
            <div class="mini-stat-meta">当前回收站项目</div>
          </div>
          <div class="mini-stat">
            <div class="mini-stat-label">操作日志</div>
            <div class="mini-stat-value">${safeText(maintenance.logsCount, '0')}</div>
            <div class="mini-stat-meta">总记录数</div>
          </div>
          <div class="mini-stat">
            <div class="mini-stat-label">后台任务</div>
            <div class="mini-stat-value">${safeText(maintenance.taskCount, '0')}</div>
            <div class="mini-stat-meta">待处理任务</div>
          </div>
          <div class="mini-stat">
            <div class="mini-stat-label">缩略图缓存</div>
            <div class="mini-stat-value">${maintenance.thumbnailsPresent ? icons.check : icons.close}</div>
            <div class="mini-stat-meta">${maintenance.thumbnailsPresent ? '有缓存' : '无缓存'}</div>
          </div>
        </div>
        <div class="admin-grid" style="margin-top:16px;">
          ${MAINTENANCE_ACTIONS.map(item => {
            const busy = maintenanceBusyAction === item.action;
            return `
              <div class="admin-card span-4">
                <div class="admin-label">${escapeHtml(item.label)}</div>
                <div class="admin-copy" style="margin:6px 0 14px;font-size:13px;line-height:1.6;">${escapeHtml(item.desc)}</div>
                <button class="btn ${item.danger ? 'btn-danger' : 'btn-primary'} toolbar-btn" type="button"
                  data-action="confirm-maintenance-action"
                  data-maintenance-action="${escapeHtml(item.action)}"
                  data-maintenance-label="${escapeHtml(item.label)}"
                  ${busy ? 'disabled' : ''}>
                  ${busy ? icons.refresh : icons.trash}
                  <span>${busy ? '执行中...' : '执行'}</span>
                </button>
              </div>
            `;
          }).join('')}
        </div>
      </section>
    `;
  }

  function renderAdminTaskListSection(admin) {
    const { tasks, tasksLoading } = admin;
    if (tasksLoading) {
      return `
        <section class="admin-section">
          <div class="admin-section-head">
            <div><h2 class="admin-section-title">上传任务</h2></div>
          </div>
          ${renderEmptyState('加载中', '正在获取任务列表...', icons.refresh)}
        </section>
      `;
    }
    if (!tasks || !tasks.length) {
      return '';
    }
    const fmtTime = ts => {
      if (!ts) return '-';
      const d = new Date(ts);
      return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    };
    const statusLabel = status => {
      if (status === 'completed') return '<span class="badge badge-success">完成</span>';
      if (status === 'partial') return '<span class="badge badge-warning">部分失败</span>';
      if (status === 'failed') return '<span class="badge badge-error">失败</span>';
      if (status === 'running') return '<span class="badge badge-info">运行中</span>';
      return '<span class="badge">待处理</span>';
    };
    return `
      <section class="admin-section">
        <div class="admin-section-head">
          <div>
            <h2 class="admin-section-title">上传任务</h2>
            <p class="admin-section-copy">最近的上传队列任务记录。</p>
          </div>
          <button class="btn toolbar-btn" type="button" data-action="refresh-tasks">${icons.refresh}<span>刷新</span></button>
        </div>
        <div class="table-wrap" style="margin-top:12px;">
          <table class="data-table">
            <thead>
              <tr>
                <th>文件数</th>
                <th>进度</th>
                <th>状态</th>
                <th>时间</th>
              </tr>
            </thead>
            <tbody>
              ${tasks.map(t => {
                const files = t.payload?.files || [];
                const fileList = files.slice(0, 3).map(f => escapeHtml(f.name)).join(', ') + (files.length > 3 ? ` 等 ${files.length} 个` : '');
                return `
                  <tr>
                    <td>${escapeHtml(fileList)}</td>
                    <td>${t.completed || 0}/${t.total || 0}</td>
                    <td>${statusLabel(t.status)}</td>
                    <td>${fmtTime(t.createdAt)}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </section>
    `;
  }

  function renderAdminPanelContent(admin) {
    if (admin.loading) {
      return renderEmptyState('正在加载概览', '正在统计文件数量、索引状态与回收站信息。', icons.stats);
    }

    if (admin.error) {
      return renderAdminErrorState(admin.error);
    }

    if (!admin.stats) {
      return renderEmptyState('暂无概览数据', '后台接口已接通，但当前还没有可展示的概览结果。', icons.stats);
    }

    return `
      <div class="admin-scroll-stack">
        <section class="admin-section admin-section-primary">
          <div class="admin-section-head">
            <div>
              <h2 class="admin-section-title">系统统计</h2>
              <p class="admin-section-copy">集中查看文件、索引、回收站与资源趋势，主内容区随页面高度自适应并保持内部滚动。</p>
            </div>
          </div>
          ${renderAdminStatsGrid(admin.stats)}
        </section>
        ${renderAdminHealthSection(admin)}
        ${renderAdminLogsSection(admin)}
        ${renderAdminQuotaSection(admin)}
        ${renderAdminProtectedPathsSection(admin)}
        ${renderAdminHiddenPathsSection(admin)}
        ${renderAdminStorageSection(admin)}
        ${renderAdminWebhooksSection(admin)}
        ${renderAdminWebhookDeliveriesSection(admin)}
        ${renderAdminMaintenanceSection(admin)}
        ${renderAdminTaskListSection(admin)}
        ${renderAdminSharesSection(admin)}
      </div>
    `;
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
    const isActive = isShareActive(item);
    const isExpired = item?.expired || expiry.level === 'expired';
    const isExhausted = item?.exhausted;
    const isExpiringSoon = expiry.level === 'soon';
    const isUnlimited = expiry.level === 'unlimited';

    return `
      <article class="latest-item ${isExpired ? 'share-item-expired' : ''} ${isExhausted ? 'share-item-exhausted' : ''} ${isExpiringSoon ? 'share-item-expiring-soon' : ''}">
        <div class="status-bar" style="margin-bottom:14px;">
          <div class="status-main">
            <span class="status-dot ${isExpired ? 'status-dot-expired' : isExhausted ? 'status-dot-exhausted' : isExpiringSoon ? 'status-dot-soon' : ''}"></span>
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

        ${isExpiringSoon && isActive ? `
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

        ${isExhausted && !isExpired ? `
          <div class="attention-item" data-level="warning" style="margin:12px 0;">
            <h3 class="attention-title">下载次数已用尽</h3>
            <div class="attention-copy">此分享的下载次数已达上限，无法继续下载。预览功能${item?.allowPreview ? '仍可使用' : '已禁用'}。</div>
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
        <section class="page-stack admin-page">
          <section class="page-panel auth-board glass-card admin-auth-panel">
            <div class="page-panel-body admin-panel-scroll">
              ${renderEmptyState('需要管理员登录', '登录后即可查看文件统计、索引状态、分享记录和后续管理模块。', icons.lock)}
            </div>
          </section>
        </section>
      `;
    }

    return `
      <section class="page-stack admin-page">
        ${renderAdminOverviewStrip(admin)}
        ${renderAdminControlStrip(admin)}
        <section class="page-panel admin-board glass-card admin-main-panel">
          <div class="page-panel-body admin-panel-scroll">
            ${renderAdminPanelContent(admin)}
          </div>
        </section>
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
