export function createPageRenderers(deps) {
  const {
    icons,
    escapeHtml,
    renderEmptyState,
    renderEmptyStateCompact,
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



  function renderAdminStatsGrid(stats) {
    const breakdown = Object.entries(stats.breakdown || {});
    const latest = (stats.latest || []).slice(0, 6);
    const attention = stats.attention || [];

    return `
      <div class="admin-grid admin-grid-overview">
        <div class="admin-card span-4">
          <div class="admin-label">文件总数</div>
          <div class="admin-value">${safeText(stats.files?.count || 0, '0')}</div>
          <div class="admin-copy">
            总容量 ${safeText(stats.files?.totalSizeFormatted, '0 B')}，文件夹 ${safeText(stats.files?.folderMarkers || 0, '0')}。
          </div>
          <div class="admin-status-row">
            <span class="toolbar-tag tag-active">存储正常</span>
          </div>
        </div>

        <div class="admin-card span-4">
          <div class="admin-label">回收站项目</div>
          <div class="admin-value">${safeText(stats.trash?.count || 0, '0')}</div>
          <div class="admin-copy">
            累计 ${safeText(stats.trash?.sizeFormatted, '0 B')}，约占 ${safeText(stats.trash?.percentOfFiles || 0, '0')}%。
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
            索引 ${safeText(stats.index?.count || 0, '0')} 条，更新于
            ${safeText(stats.index?.latestUpdatedAt ? formatTime(stats.index.latestUpdatedAt) : '未知')}。
          </div>
          <div class="admin-status-row">
            <span class="toolbar-tag tag-active">${safeText(stats.index?.recommendation, '正常')}</span>
          </div>
        </div>

        <div class="admin-card span-8">
          <div class="admin-label">类型分布</div>
          <div class="type-grid">
            ${
              breakdown.length
                ? breakdown.map(([key, value]) => `
                  <div class="type-chip">
                    <span class="type-chip-name">${safeText(key)}</span>
                    <span class="type-chip-meta">${safeText(value.count || 0, '0')} 项 · ${safeText(value.sizeFormatted || formatBytes(value.size || 0), '0 B')}</span>
                  </div>
                `).join('')
                : '<div class="muted">暂无分类数据</div>'
            }
          </div>
        </div>

        <div class="admin-card span-4">
          <div class="admin-label">系统提醒</div>
          <div class="attention-list attention-list-compact">
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
          <div class="latest-grid">
            ${
              latest.length
                ? latest.map(item => `
                  <article class="latest-chip">
                    <h3 class="latest-chip-name">${safeText(item.key || '')}</h3>
                    <div class="latest-chip-meta">
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
      <div class="hero-strip-compact">
        <div class="mini-stat-compact">
          <div class="mini-stat-label">分享总数</div>
          <div class="mini-stat-value">${safeText(shares.length, '0')}</div>
          <div class="mini-stat-meta">当前可管理的全部分享条目</div>
        </div>
        <div class="mini-stat-compact">
          <div class="mini-stat-label">有效分享</div>
          <div class="mini-stat-value">${safeText(shares.filter(item => isShareActive(item)).length, '0')}</div>
          <div class="mini-stat-meta">未过期且次数未用尽</div>
        </div>
        <div class="mini-stat-compact">
          <div class="mini-stat-label">已失效</div>
          <div class="mini-stat-value">${safeText(expiredCount + exhaustedCount, '0')}</div>
          <div class="mini-stat-meta">已过期 ${expiredCount} · 次数用尽 ${exhaustedCount}</div>
        </div>
      </div>
      ${
        admin.sharesLoading
          ? renderEmptyStateCompact('正在加载分享列表', '正在获取已创建的分享记录和访问状态。', icons.refresh)
          : admin.sharesError
            ? renderShareErrorState(admin.sharesError)
            : shares.length === 0
              ? renderEmptyStateCompact('暂无分享记录', '系统中还没有创建任何分享。您可以在文件管理页面选择文件并创建分享链接。', icons.share)
              : filteredShares.length === 0
                ? renderEmptyStateCompact('筛选结果为空', `当前筛选条件"${getFilterLabel(shareFilter)}"没有匹配的分享记录，请尝试其他筛选条件。`, icons.search)
                : renderShareList(filteredShares, busyToken)
      }
    `;
  }

  function renderAdminHealthSection(admin) {
    const health = admin.health;
    const loading = admin.healthLoading;
    const error = admin.healthError;

    if (error) {
      return `
        <div class="empty-state">
          <div class="empty-orb">${icons.lock}</div>
          <p class="empty-copy">${escapeHtml(error)}</p>
          <div style="margin-top:12px;"><button class="btn toolbar-btn" type="button" data-action="refresh-admin-health">${icons.eye}<span>重新加载</span></button></div>
        </div>
      `;
    }

    if (loading || !health) {
      return renderEmptyState('加载中', '正在检查各服务组件运行状态...', icons.eye);
    }

    const items = Object.entries(health.components || health).filter(([, v]) => typeof v === 'object');
    return `
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
    `;
  }

  function renderAdminLogsSection(admin) {
    const { logs, logsLoading, logsError, logsPage, logsTotalPages, logsFilter } = admin;

    if (logsError) {
      return `
        <div class="empty-state">
          <div class="empty-orb">${icons.lock}</div>
          <p class="empty-copy">${escapeHtml(logsError)}</p>
          <div style="margin-top:12px;"><button class="btn toolbar-btn" type="button" data-action="refresh-admin-logs">${icons.refresh}<span>重新加载</span></button></div>
        </div>
      `;
    }

    return `
      <div class="admin-filter-bar" style="margin-bottom:10px;">
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
          ? renderEmptyStateCompact('正在加载日志', '正在获取系统操作记录。', icons.refresh)
          : logs.length === 0
            ? renderEmptyStateCompact('暂无操作日志', '系统中还没有操作记录。', icons.list)
            : `
              <div class="latest-list-compact">
                ${logs.map(item => `
                  <article class="latest-item-compact">
                    <div class="latest-title">${safeText(item.action || '操作')} · ${safeText(item.path || '/')}</div>
                    <div class="latest-copy">
                      ${item.user ? `用户 ${escapeHtml(item.user)}` : ''}
                      ${item.ip ? ` · IP ${escapeHtml(item.ip)}` : ''}
                      ${item.createdAt ? ` · ${formatTime(item.createdAt)} (${formatRelative(item.createdAt)})` : ''}
                    </div>
                    ${item.detail ? `<div class="latest-copy" style="margin-top:2px;color:var(--muted);font-size:12px;">${escapeHtml(item.detail)}</div>` : ''}
                  </article>
                `).join('')}
              </div>
              <div class="admin-pagination" style="display:flex;align-items:center;gap:8px;margin-top:10px;">
                <button class="btn btn-muted" type="button" data-action="set-logs-page" data-page="${logsPage - 1}" ${logsPage <= 1 ? 'disabled' : ''}>上一页</button>
                <span style="font-size:12px;color:var(--muted);">第 ${logsPage} / ${logsTotalPages || 1} 页</span>
                <button class="btn btn-muted" type="button" data-action="set-logs-page" data-page="${logsPage + 1}" ${logsPage >= logsTotalPages ? 'disabled' : ''}>下一页</button>
              </div>
            `
      }
    `;
  }

  function renderAdminQuotaSection(admin) {
    const { quota, quotaLoading, quotaError } = admin;

    if (quotaError) {
      return `
        <div class="empty-state">
          <div class="empty-orb">${icons.lock}</div>
          <p class="empty-copy">${escapeHtml(quotaError)}</p>
          <div style="margin-top:12px;"><button class="btn toolbar-btn" type="button" data-action="refresh-admin-quota">${icons.refresh}<span>重新加载</span></button></div>
        </div>
      `;
    }

    if (quotaLoading || !quota) {
      return renderEmptyStateCompact('加载中', '正在获取存储配额信息...', icons.stats);
    }

    const usedFormatted = formatBytes(quota.used || 0);
    const totalFormatted = formatBytes(quota.total || quota.limit || 0);
    const pct = quota.used && (quota.total || quota.limit)
      ? Math.round((quota.used / (quota.total || quota.limit)) * 100)
      : 0;

    return `
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
    `;
  }

  function renderAdminProtectedPathsSection(admin) {
    const { protectedPaths, protectedPathsLoading, protectedPathsError } = admin;

    return `
      ${
        protectedPathsLoading
          ? renderEmptyStateCompact('正在加载受保护路径', '正在获取受保护路径列表。', icons.lock)
          : protectedPathsError
            ? `
              <div class="empty-state">
                <div class="empty-orb">${icons.lock}</div>
                <p class="empty-copy">${escapeHtml(protectedPathsError)}</p>
              </div>
            `
            : protectedPaths.length === 0
              ? renderEmptyStateCompact('暂无受保护路径', '还没有设置任何受保护路径。点击上方按钮添加。', icons.lock)
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
    `;
  }

  function renderAdminHiddenPathsSection(admin) {
    const { hiddenPaths, hiddenPathsLoading, hiddenPathsError } = admin;

    return `
      ${
        hiddenPathsLoading
          ? renderEmptyStateCompact('正在加载隐藏路径', '正在获取隐藏路径列表。', icons.eye)
          : hiddenPathsError
            ? `
              <div class="empty-state">
                <div class="empty-orb">${icons.eye}</div>
                <p class="empty-copy">${escapeHtml(hiddenPathsError)}</p>
              </div>
            `
            : hiddenPaths.length === 0
              ? renderEmptyStateCompact('暂无隐藏路径', '还没有设置任何隐藏路径。点击上方按钮添加。', icons.eye)
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
    `;
  }

  function renderAdminStorageSection(admin) {
    const { storageConfig, storageConfigLoading, storageConfigError, storageConfigSaving } = admin;

    if (storageConfigError) {
      return `
        <div class="empty-state">
          <div class="empty-orb">${icons.stats}</div>
          <p class="empty-copy">${escapeHtml(storageConfigError)}</p>
          <div style="margin-top:12px;"><button class="btn toolbar-btn" type="button" data-action="refresh-admin-storage-config">${icons.refresh}<span>重新加载</span></button></div>
        </div>
      `;
    }

    if (storageConfigLoading || !storageConfig) {
      return renderEmptyState('加载中', '正在加载存储空间配置...', icons.stats);
    }

    const r2 = storageConfig.r2 || {};
    const spaces = storageConfig.spaces || [];
    const bindings = storageConfig.bindings || [];
    const usagePercent = r2.usedPercent || 0;
    const usageBarColor = usagePercent >= 90 ? 'var(--danger)' : usagePercent >= 75 ? 'var(--warning)' : 'var(--primary)';

    return `
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

      <div style="display:flex;align-items:center;justify-content:space-between;margin-top:24px;">
        <h3 style="margin:0;font-size:18px;font-weight:700;">S3 存储空间</h3>
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

      <div style="display:flex;align-items:center;justify-content:space-between;margin-top:24px;">
        <h3 style="margin:0;font-size:18px;font-weight:700;">路径绑定</h3>
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
    `;
  }

  function renderAdminWebhooksSection(admin) {
    const { webhooks, webhooksLoading, webhooksError } = admin;

    if (webhooksError) {
      return `
        <div class="empty-state">
          <div class="empty-orb">${icons.link}</div>
          <p class="empty-copy">${escapeHtml(webhooksError)}</p>
          <div style="margin-top:12px;"><button class="btn toolbar-btn" type="button" data-action="refresh-admin-webhooks">${icons.refresh}<span>重新加载</span></button></div>
        </div>
      `;
    }

    if (webhooksLoading) {
      return renderEmptyState('加载中', '正在加载 Webhook 配置...', icons.link);
    }

    return `
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
    `;
  }

  function renderAdminWebhookDeliveriesSection(admin) {
    const { webhookDeliveries, webhookDeliveriesLoading } = admin;

    return `
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
    const { tasks, tasksLoading } = admin;

    let maintenanceHtml = '';
    if (maintenanceError) {
      maintenanceHtml = `
        <div class="empty-state">
          <div class="empty-orb">${icons.lock}</div>
          <p class="empty-copy">${escapeHtml(maintenanceError)}</p>
          <div style="margin-top:12px;"><button class="btn toolbar-btn" type="button" data-action="refresh-admin-maintenance">${icons.refresh}<span>重新加载</span></button></div>
        </div>
      `;
    } else if (maintenanceLoading || !maintenance) {
      maintenanceHtml = renderEmptyStateCompact('加载中', '正在获取系统维护快照...', icons.refresh);
    } else {
      maintenanceHtml = `
        <div class="hero-strip-compact">
          <div class="mini-stat-compact">
            <div class="mini-stat-label">索引记录</div>
            <div class="mini-stat-value">${safeText(maintenance.indexCount, '0')}</div>
            <div class="mini-stat-meta">${safeText(maintenance.indexTotalSizeFormatted, '0 B')}${maintenance.indexFresh ? ' · 同步中' : ' · 待同步'}</div>
          </div>
          <div class="mini-stat-compact">
            <div class="mini-stat-label">R2 对象</div>
            <div class="mini-stat-value">${safeText(maintenance.r2SampleCount, '0')}</div>
            <div class="mini-stat-meta">${maintenance.r2SampleTruncated ? '超 1000 条' : '可见对象数'}</div>
          </div>
          <div class="mini-stat-compact">
            <div class="mini-stat-label">访问记录</div>
            <div class="mini-stat-value">${safeText(maintenance.accessAttemptCount, '0')}</div>
            <div class="mini-stat-meta">失败记录数</div>
          </div>
          <div class="mini-stat-compact">
            <div class="mini-stat-label">回收站</div>
            <div class="mini-stat-value">${safeText(maintenance.trashCount, '0')}</div>
            <div class="mini-stat-meta">当前回收站项目</div>
          </div>
          <div class="mini-stat-compact">
            <div class="mini-stat-label">操作日志</div>
            <div class="mini-stat-value">${safeText(maintenance.logsCount, '0')}</div>
            <div class="mini-stat-meta">总记录数</div>
          </div>
          <div class="mini-stat-compact">
            <div class="mini-stat-label">后台任务</div>
            <div class="mini-stat-value">${safeText(maintenance.taskCount, '0')}</div>
            <div class="mini-stat-meta">待处理任务</div>
          </div>
          <div class="mini-stat-compact">
            <div class="mini-stat-label">缩略图缓存</div>
            <div class="mini-stat-value">${maintenance.thumbnailsPresent ? icons.check : icons.close}</div>
            <div class="mini-stat-meta">${maintenance.thumbnailsPresent ? '有缓存' : '无缓存'}</div>
          </div>
        </div>
        <div class="admin-grid" style="margin-top:12px;gap:10px;">
          ${MAINTENANCE_ACTIONS.map(item => {
            const busy = maintenanceBusyAction === item.action;
            return `
              <div class="admin-card span-4" style="padding:10px 14px;">
                <div class="admin-label">${escapeHtml(item.label)}</div>
                <div class="admin-copy" style="margin:4px 0 10px;font-size:12px;line-height:1.5;">${escapeHtml(item.desc)}</div>
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
      `;
    }

    let tasksHtml = '';
    if (tasksLoading) {
      tasksHtml = renderEmptyStateCompact('加载中', '正在获取任务列表...', icons.refresh);
    } else if (!tasks || !tasks.length) {
      tasksHtml = renderEmptyStateCompact('暂无任务', '当前没有后台任务在运行。', icons.list);
    } else {
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
      tasksHtml = `
        <div class="table-wrap">
          <table class="data-table-compact">
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
      `;
    }

    return `
      <div class="admin-section-compact">
        <section>
          <h3>维护操作</h3>
          ${maintenanceHtml}
        </section>
        <section>
          <h3>后台任务</h3>
          ${tasksHtml}
        </section>
      </div>
    `;
  }

  function renderAdminTaskListSection(admin) {
    const { tasks, tasksLoading } = admin;
    if (tasksLoading) {
      return renderEmptyStateCompact('加载中', '正在获取任务列表...', icons.refresh);
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
    `;
  }

  function renderAdminNotificationsSection(admin) {
    const { adminNotifHistory, adminNotifHistoryLoading, notificationsUnread } = admin;
    if (adminNotifHistoryLoading) {
      return renderEmptyStateCompact('加载中', '正在获取通知历史...', icons.bell);
    }
    const items = adminNotifHistory || [];
    return `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
        <span style="font-size:14px;color:var(--muted);">共 ${items.length} 条通知${notificationsUnread ? `，${notificationsUnread} 条未读` : ''}</span>
        <button class="btn toolbar-btn" type="button" data-action="refresh-admin-notifications">${icons.refresh}<span>刷新</span></button>
      </div>
      ${
        items.length === 0
          ? renderEmptyStateCompact('暂无通知', '目前还没有任何通知记录。', icons.bell)
          : `
            <div class="table-wrap">
              <table class="data-table">
                <thead>
                  <tr>
                    <th style="width:120px;">时间</th>
                    <th>消息</th>
                    <th style="width:72px;">状态</th>
                    <th style="width:72px;">操作</th>
                  </tr>
                </thead>
                <tbody>
                  ${items.map(n => `
                    <tr class="${n.read ? '' : 'notif-table-row-unread'}">
                      <td style="white-space:nowrap;font-size:12px;color:var(--muted);">${formatRelative(n.created_at)}</td>
                      <td>${escapeHtml(n.message)}</td>
                      <td>${n.read ? '<span class="table-tag">已读</span>' : '<span class="table-tag table-tag-unread">未读</span>'}</td>
                      <td>${n.read ? '' : `<button class="btn btn-small btn-ghost" type="button" data-action="admin-mark-notif-read" data-notif-id="${n.id}">${icons.check}</button>`}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          `
      }
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
      <div class="latest-list-compact">
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
      <article class="latest-item-compact ${isExpired ? 'share-item-expired' : ''} ${isExhausted ? 'share-item-exhausted' : ''} ${isExpiringSoon ? 'share-item-expiring-soon' : ''}">
        <div class="status-bar" style="margin-bottom:8px;">
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
          <div class="attention-item" data-level="warning" style="margin:8px 0;">
            <h3 class="attention-title">即将到期</h3>
            <div class="attention-copy">此分享将于 ${safeText(expiry.label)}，之后将无法访问。如需继续使用，请重新创建分享。</div>
          </div>
        ` : ''}

        ${isExpired ? `
          <div class="attention-item" data-level="warning" style="margin:8px 0;">
            <h3 class="attention-title">已过期</h3>
            <div class="attention-copy">此分享已过期，无法继续访问。建议清理过期分享以释放资源。</div>
          </div>
        ` : ''}

        ${isExhausted && !isExpired ? `
          <div class="attention-item" data-level="warning" style="margin:8px 0;">
            <h3 class="attention-title">下载次数已用尽</h3>
            <div class="attention-copy">此分享的下载次数已达上限，无法继续下载。预览功能${item?.allowPreview ? '仍可使用' : '已禁用'}。</div>
          </div>
        ` : ''}

        <div class="latest-copy" style="margin-top:8px; line-height:1.8;">
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

  const ADMIN_TABS = [
    { id: 'overview', label: '概览' },
    { id: 'system', label: '系统状态' },
    { id: 'storage', label: '存储' },
    { id: 'logs', label: '日志' },
    { id: 'paths', label: '路径管理' },
    { id: 'webhooks', label: 'Webhook' },
    { id: 'maintenance', label: '维护' },
    { id: 'shares', label: '分享' },
  ];

  function renderSystemStatusSection(admin) {
    const health = admin.health;
    const healthLoading = admin.healthLoading;
    const healthError = admin.healthError;
    const { quota, quotaLoading, quotaError } = admin;
    const { maintenance, maintenanceLoading, maintenanceError, maintenanceBusyAction } = admin;

    let envHtml = '';
    if (healthError) {
      envHtml = `<div class="empty-state-compact"><p class="empty-copy">${escapeHtml(healthError)}</p></div>`;
    } else if (healthLoading || !health) {
      envHtml = renderEmptyStateCompact('加载中', '正在检查服务组件状态...', icons.eye);
    } else {
      const items = Object.entries(health.components || health).filter(([, v]) => typeof v === 'object');
      envHtml = `
        <div class="env-grid">
          ${items.map(([key, value]) => {
            const status = String(value?.status || 'unknown');
            const ok = status === 'ok' || status === 'healthy';
            return `
              <div class="env-item">
                <div class="env-item-head">
                  <span class="env-item-name">${safeText(key)}</span>
                  <span class="env-status ${ok ? 'env-status-ok' : 'env-status-error'}">${ok ? '正常' : '异常'}</span>
                </div>
                <div class="env-item-desc">${safeText(value?.message || status, '未知')}</div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    }

    let maintHtml = '';
    if (maintenanceError) {
      maintHtml = `<div class="empty-state-compact"><p class="empty-copy">${escapeHtml(maintenanceError)}</p></div>`;
    } else if (maintenanceLoading || !maintenance) {
      maintHtml = renderEmptyStateCompact('加载中', '正在获取维护快照...', icons.refresh);
    } else {
      maintHtml = `
        <div class="maint-grid">
          <div class="maint-item">
            <div class="maint-item-head">
              <span class="maint-item-name">文件索引</span>
              <span class="maint-item-value">${safeText(maintenance.indexCount, '0')}</span>
            </div>
            <div class="maint-item-desc">${safeText(maintenance.indexTotalSizeFormatted, '0 B')}${maintenance.indexFresh ? ' · 已同步' : ' · 待同步'}</div>
          </div>
          <div class="maint-item">
            <div class="maint-item-head">
              <span class="maint-item-name">索引更新</span>
              <span class="maint-item-time">${maintenance.indexUpdatedAt ? formatTime(maintenance.indexUpdatedAt) : '未知'}</span>
            </div>
            <div class="maint-item-desc">索引与存储${maintenance.indexFresh ? '一致' : '不一致'}</div>
          </div>
          <div class="maint-item">
            <div class="maint-item-head">
              <span class="maint-item-name">访问失败记录</span>
              <span class="maint-item-value">${safeText(maintenance.accessAttemptCount, '0')}</span>
            </div>
            <div class="maint-item-desc">受保护路径的密码错误记录</div>
          </div>
          <div class="maint-item">
            <div class="maint-item-head">
              <span class="maint-item-name">回收站</span>
              <span class="maint-item-value">${safeText(maintenance.trashCount, '0')}</span>
            </div>
            <div class="maint-item-desc">可回收站占用 R2 空间</div>
          </div>
          <div class="maint-item">
            <div class="maint-item-head">
              <span class="maint-item-name">操作日志</span>
              <span class="maint-item-value">${safeText(maintenance.logsCount, '0')}</span>
            </div>
            <div class="maint-item-desc">管理员操作记录</div>
          </div>
          <div class="maint-item">
            <div class="maint-item-head">
              <span class="maint-item-name">缩略图缓存</span>
              <span class="maint-item-value">${maintenance.thumbnailsPresent ? '有' : '无'}</span>
            </div>
            <div class="maint-item-desc">.thumbs/ 系统前缀</div>
          </div>
        </div>
        <div class="maint-actions">
          <button class="btn btn-primary toolbar-btn" type="button" data-action="confirm-maintenance-action" data-maintenance-action="rebuild-index" data-maintenance-label="重建文件索引" ${maintenanceBusyAction ? 'disabled' : ''}>
            ${maintenanceBusyAction === 'rebuild-index' ? icons.refresh : icons.trash}
            <span>${maintenanceBusyAction === 'rebuild-index' ? '执行中...' : '重建文件索引'}</span>
          </button>
          <button class="btn toolbar-btn" type="button" data-action="confirm-maintenance-action" data-maintenance-action="cleanup-access-attempts" data-maintenance-label="清理访问失败记录" ${maintenanceBusyAction ? 'disabled' : ''}>
            ${maintenanceBusyAction === 'cleanup-access-attempts' ? icons.refresh : icons.trash}
            <span>${maintenanceBusyAction === 'cleanup-access-attempts' ? '执行中...' : '清理访问失败记录'}</span>
          </button>
          <button class="btn toolbar-btn" type="button" data-action="confirm-maintenance-action" data-maintenance-action="cleanup-thumbnails" data-maintenance-label="清理缩略图缓存" ${maintenanceBusyAction ? 'disabled' : ''}>
            ${maintenanceBusyAction === 'cleanup-thumbnails' ? icons.refresh : icons.trash}
            <span>${maintenanceBusyAction === 'cleanup-thumbnails' ? '执行中...' : '清理缩略图缓存'}</span>
          </button>
        </div>
      `;
    }

    let quotaHtml = '';
    if (quotaError) {
      quotaHtml = `<div class="empty-state-compact"><p class="empty-copy">${escapeHtml(quotaError)}</p></div>`;
    } else if (quotaLoading || !quota) {
      quotaHtml = renderEmptyStateCompact('加载中', '正在获取存储配额信息...', icons.stats);
    } else {
      const usedFormatted = formatBytes(quota.used || 0);
      const totalFormatted = formatBytes(quota.total || quota.limit || 0);
      const pct = quota.used && (quota.total || quota.limit)
        ? Math.round((quota.used / (quota.total || quota.limit)) * 100)
        : 0;
      quotaHtml = `
        <div class="quota-bar-wrap">
          <div class="quota-bar-info">
            <span>已用 ${usedFormatted} / ${totalFormatted}</span>
            <span>${pct}%</span>
          </div>
          <div class="quota-bar">
            <div class="quota-bar-fill" style="width:${Math.min(pct, 100)}%;"></div>
          </div>
        </div>
      `;
    }

    return `
      <div class="sys-status-page">
        <div class="sys-status-header">
          <div>
            <h3 class="sys-status-title">系统状态</h3>
            <p class="sys-status-desc">检查部署绑定、索引状态和维护入口。</p>
          </div>
          <button class="btn toolbar-btn" type="button" data-action="refresh-admin-health" data-action2="refresh-admin-maintenance">${icons.refresh}<span>刷新</span></button>
        </div>
        <div class="sys-status-body">
          <div class="sys-status-left">
            <div class="sys-status-card">
              <div class="sys-status-card-head">
                <h4 class="sys-status-card-title">环境检查</h4>
                <span class="sys-status-card-desc">关键绑定和登录配置</span>
              </div>
              ${envHtml}
            </div>
            <div class="sys-status-card">
              <div class="sys-status-card-head">
                <h4 class="sys-status-card-title">存储配额</h4>
              </div>
              ${quotaHtml}
            </div>
          </div>
          <div class="sys-status-right">
            <div class="sys-status-card">
              <div class="sys-status-card-head">
                <h4 class="sys-status-card-title">维护中心</h4>
                <span class="sys-status-card-desc">索引、缓存和记录清理</span>
              </div>
              ${maintHtml}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderStorageSection(admin) {
    const { storageConfig, storageConfigLoading, storageConfigError, storageConfigSaving } = admin;

    if (storageConfigError) {
      return `<div class="empty-state-compact"><p class="empty-copy">${escapeHtml(storageConfigError)}</p></div>`;
    }

    if (storageConfigLoading || !storageConfig) {
      return renderEmptyStateCompact('加载中', '正在加载存储空间配置...', icons.stats);
    }

    const r2 = storageConfig.r2 || {};
    const spaces = storageConfig.spaces || [];
    const bindings = storageConfig.bindings || [];
    const usagePercent = r2.usedPercent || 0;
    const usageBarColor = usagePercent >= 90 ? 'var(--danger)' : usagePercent >= 75 ? 'var(--warning)' : 'var(--primary)';

    return `
      <div class="admin-section-compact">
        <section>
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
            <h3>Cloudflare R2</h3>
            <button class="btn toolbar-btn" type="button" data-action="show-edit-storage-quota" ${storageConfigSaving ? 'disabled' : ''}>${icons.edit}<span>编辑配额</span></button>
          </div>
          <div class="sys-status-card" style="margin:0;">
            <div class="env-item">
              <div class="env-item-head">
                <span class="env-item-name">${escapeHtml(r2.name || 'Cloudflare R2')}</span>
                <span class="env-status env-status-ok">正常</span>
              </div>
              <div class="env-item-desc">${escapeHtml(r2.usedFormatted || '0')} / ${escapeHtml(r2.quotaFormatted || '未设置')} · 已用 ${usagePercent}%</div>
              <div style="margin:8px 0 0;height:5px;background:var(--border);border-radius:3px;overflow:hidden;">
                <div style="height:100%;width:${Math.min(usagePercent, 100)}%;background:${usageBarColor};border-radius:3px;transition:width .3s;"></div>
              </div>
            </div>
          </div>
        </section>

        <section>
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
            <h3>S3 存储空间</h3>
            <button class="btn btn-primary toolbar-btn" type="button" data-action="show-add-storage-space" ${storageConfigSaving ? 'disabled' : ''}>${icons.plus}<span>添加空间</span></button>
          </div>
          ${
            spaces.length === 0
              ? renderEmptyStateCompact('暂无 S3 空间', '还没有配置任何外部存储空间。', icons.stats)
              : `
                <div class="latest-list-compact">
                  ${spaces.map(item => {
                    const pct = item.usedPercent || 0;
                    const barColor = pct >= 90 ? 'var(--danger)' : pct >= 75 ? 'var(--warning)' : 'var(--primary)';
                    return `
                      <article class="latest-item-compact">
                        <div class="status-bar">
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
                        <div class="latest-copy">
                          ${escapeHtml(item.usedFormatted || '0')} / ${escapeHtml(item.quotaFormatted || '未设置')}
                          <span style="margin:0 6px;">·</span>
                          <span style="color:${barColor};">${pct}%</span>
                          <span style="margin:0 6px;">·</span>
                          ${escapeHtml(item.endpoint || 'N/A')}
                        </div>
                      </article>
                    `;
                  }).join('')}
                </div>
              `
          }
        </section>

        <section>
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
            <h3>溢出策略</h3>
          </div>
          <div class="sys-status-card" style="margin:0;">
            <div class="env-item">
              <div class="env-item-head">
                <span class="env-item-name">${storageConfig.overflowEnabled ? '已启用' : '已禁用'}</span>
                <span class="toolbar-tag">阈值 ${storageConfig.overflowThresholdPercent || 85}%</span>
              </div>
              <div class="env-item-desc">R2 空间满时自动写入指定的 S3 溢出目标</div>
            </div>
          </div>
        </section>
      </div>
    `;
  }

  function renderPathManagementSection(admin) {
    const { protectedPaths, protectedPathsLoading, protectedPathsError } = admin;
    const { hiddenPaths, hiddenPathsLoading, hiddenPathsError } = admin;

    let protectedHtml = '';
    if (protectedPathsLoading) {
      protectedHtml = renderEmptyStateCompact('正在加载受保护路径', '正在获取受保护路径列表。', icons.lock);
    } else if (protectedPathsError) {
      protectedHtml = `<div class="empty-state"><div class="empty-orb">${icons.lock}</div><p class="empty-copy">${escapeHtml(protectedPathsError)}</p></div>`;
    } else if (protectedPaths.length === 0) {
      protectedHtml = renderEmptyStateCompact('暂无受保护路径', '还没有设置任何受保护路径。点击下方按钮添加。', icons.lock);
    } else {
      protectedHtml = `
        <div class="latest-list-compact">
          ${protectedPaths.map(item => {
            const path = String(item?.path || item?.folder || '/');
            const note = item?.note || '';
            const showName = item?.showName || '';
            return `
              <article class="latest-item-compact">
                <div class="status-bar">
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
      `;
    }

    let hiddenHtml = '';
    if (hiddenPathsLoading) {
      hiddenHtml = renderEmptyStateCompact('正在加载隐藏路径', '正在获取隐藏路径列表。', icons.eye);
    } else if (hiddenPathsError) {
      hiddenHtml = `<div class="empty-state"><div class="empty-orb">${icons.eye}</div><p class="empty-copy">${escapeHtml(hiddenPathsError)}</p></div>`;
    } else if (hiddenPaths.length === 0) {
      hiddenHtml = renderEmptyStateCompact('暂无隐藏路径', '还没有设置任何隐藏路径。点击下方按钮添加。', icons.eye);
    } else {
      hiddenHtml = `
        <div class="latest-list-compact">
          ${hiddenPaths.map(item => {
            const path = String(item?.path || '/');
            return `
              <article class="latest-item-compact">
                <div class="status-bar">
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
      `;
    }

    return `
      <div class="admin-section-compact">
        <section>
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
            <h3>受保护路径</h3>
          </div>
          ${protectedHtml}
        </section>
        <section>
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
            <h3>隐藏路径</h3>
          </div>
          ${hiddenHtml}
        </section>
      </div>
    `;
  }

  function renderWebhookSection(admin) {
    const { webhooks, webhooksLoading, webhooksError } = admin;
    const { webhookDeliveries, webhookDeliveriesLoading } = admin;

    let webhooksHtml = '';
    if (webhooksError) {
      webhooksHtml = `
        <div class="empty-state">
          <div class="empty-orb">${icons.link}</div>
          <p class="empty-copy">${escapeHtml(webhooksError)}</p>
          <div style="margin-top:12px;"><button class="btn toolbar-btn" type="button" data-action="refresh-admin-webhooks">${icons.refresh}<span>重新加载</span></button></div>
        </div>
      `;
    } else if (webhooksLoading) {
      webhooksHtml = renderEmptyStateCompact('加载中', '正在加载 Webhook 配置...', icons.link);
    } else if (webhooks.length === 0) {
      webhooksHtml = renderEmptyStateCompact('暂无 Webhook', '还没有配置任何 Webhook。添加后可在文件操作或管理事件时收到通知。', icons.link);
    } else {
      webhooksHtml = `
        <div class="latest-list-compact">
          ${webhooks.map(item => `
            <article class="latest-item-compact">
              <div class="status-bar">
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
              <div class="latest-copy">
                ${escapeHtml(item.url)}
                <span style="margin:0 6px;">·</span>
                ${(item.events || []).map(e => `<span class="toolbar-tag">${escapeHtml(e)}</span>`).join(' ')}
              </div>
            </article>
          `).join('')}
        </div>
      `;
    }

    let deliveriesHtml = '';
    if (webhookDeliveriesLoading) {
      deliveriesHtml = renderEmptyStateCompact('加载中', '正在加载投递记录...', icons.list);
    } else if (webhookDeliveries.length === 0) {
      deliveriesHtml = renderEmptyStateCompact('暂无投递记录', '还没有任何 Webhook 投递记录。', icons.list);
    } else {
      deliveriesHtml = `
        <div class="latest-list-compact">
          ${webhookDeliveries.map(item => {
            const ok = item.ok === 1 || item.ok === true;
            return `
              <article class="latest-item-compact">
                <div class="status-bar">
                  <div class="status-main">
                    <span class="status-dot" style="background:${ok ? 'var(--primary)' : 'var(--danger)'}"></span>
                    <span>${safeText(item.event)}</span>
                    <span class="toolbar-tag">${safeText(item.endpoint)}</span>
                    <span class="toolbar-tag ${ok ? 'tag-unlimited' : 'tag-expired'}">${ok ? '成功' : '失败'}</span>
                  </div>
                </div>
                <div class="latest-copy">
                  ${ok ? `<span>HTTP ${escapeHtml(String(item.status))}</span>` : `<span>${escapeHtml(item.error || '未知错误')}</span>`}
                  <span style="margin:0 6px;">·</span>
                  <span>${escapeHtml(item.duration_ms || 0)}ms</span>
                  <span style="margin:0 6px;">·</span>
                  <span>${escapeHtml(formatRelative(item.created_at) || '')}</span>
                </div>
              </article>
            `;
          }).join('')}
        </div>
      `;
    }

    return `
      <div class="admin-section-compact">
        <section>
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
            <h3>Webhook 配置</h3>
          </div>
          ${webhooksHtml}
        </section>
        <section>
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
            <h3>投递记录</h3>
          </div>
          ${deliveriesHtml}
        </section>
      </div>
    `;
  }

  function renderAdminActiveTab(admin, activeTab) {
    switch (activeTab) {
      case 'overview':
        if (admin.loading) return renderEmptyStateCompact('正在加载概览', '正在统计文件数量、索引状态与回收站信息。', icons.stats);
        if (admin.error) return renderAdminErrorState(admin.error);
        if (!admin.stats) return renderEmptyStateCompact('暂无概览数据', '后台接口已接通，但当前还没有可展示的概览结果。', icons.stats);
        return renderAdminStatsGrid(admin.stats);
      case 'system': return renderSystemStatusSection(admin);
      case 'storage': return renderStorageSection(admin);
      case 'logs': return renderAdminLogsSection(admin);
      case 'paths': return renderPathManagementSection(admin);
      case 'webhooks': return renderWebhookSection(admin);
      case 'maintenance': return renderAdminMaintenanceSection(admin);
      case 'shares': return renderAdminSharesSection(admin);
      default: return '';
    }
  }

  function renderAdminPage(state) {
    const { role } = state.app;
    const admin = state.admin;
    const activeTab = admin.activeTab || 'overview';

    if (role !== 'admin') {
      return `
        <div class="header-card flex-shrink-0 flex items-center justify-between bg-white border border-slate-200/60 rounded-2xl p-4 shadow-sm">
          <div class="flex items-center gap-3">
            <span class="text-sm font-bold text-slate-800">管理控制台</span>
          </div>
          <div class="flex items-center gap-2">
            <a class="px-4 py-1.5 text-sm font-semibold border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 transition-colors" href="/">返回云盘</a>
          </div>
        </div>
        <div class="explorer-card flex-1 min-h-0 bg-white border border-slate-200/60 rounded-2xl p-6 shadow-sm overflow-y-auto flex flex-col">
          ${renderEmptyStateCompact('需要管理员登录', '登录后即可查看文件统计、索引状态、分享记录和后续管理模块。', icons.lock)}
        </div>
      `;
    }

    return `
      <div class="toolbar-card flex-shrink-0 flex items-center bg-white border border-slate-200/60 rounded-2xl p-3 shadow-sm">
        <div class="admin-tab-bar">
          ${ADMIN_TABS.map(tab => `
            <button class="admin-tab-btn${activeTab === tab.id ? ' admin-tab-active' : ''}"
                    type="button"
                    data-action="set-admin-tab"
                    data-tab="${tab.id}">
              ${tab.label}
            </button>
          `).join('')}
        </div>
      </div>
      <div class="explorer-card flex-1 min-h-0 bg-white border border-slate-200/60 rounded-2xl p-4 shadow-sm overflow-hidden flex flex-col">
        ${renderAdminActiveTab(admin, activeTab)}
      </div>
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
    const shareLink = `${window.location.origin}/share.html?token=${encodeURIComponent(share.token || '')}`;

    return `
      <div class="toolbar-card flex-shrink-0 flex items-center justify-between bg-white border border-slate-200/60 rounded-2xl p-4 shadow-sm">
        <div class="tools-left">
          <div class="text-sm font-bold text-slate-800 bg-[#fafbfc] border border-slate-200 rounded-lg px-4 py-1.5 shadow-sm">
            ${share.token ? `分享 · ${safeText(share.token)}` : '分享访问'}
          </div>
        </div>
        <div class="tools-right flex items-center gap-2">
          ${share.token && !share.requiresPassword ? `
            <button class="px-4 py-1.5 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors" data-action="copy-share-link" data-key="${escapeHtml(share.token)}">复制链接</button>
          ` : ''}
        </div>
      </div>

      <div class="explorer-card flex-1 min-h-0 bg-white border border-slate-200/60 rounded-2xl p-6 shadow-sm overflow-y-auto flex flex-col">
        ${
          share.loading
            ? renderEmptyState('正在读取分享', '正在加载分享文件信息与预览权限。', icons.refresh)
            : share.error && !share.requiresPassword
              ? renderEmptyState('分享不可用', share.error, icons.lock)
              : share.requiresPassword
                ? `
                  <div class="flex-1 flex flex-col items-center justify-center text-slate-400 min-h-[280px]">
                    <div>
                      <div class="w-18 h-18 mx-auto mb-4 rounded-xl grid place-items-center bg-sky-100 text-sky-600">${icons.lock}</div>
                      <h3 class="text-2xl font-bold text-center text-slate-800">请输入访问密码</h3>
                      <p class="mt-2 text-sm text-slate-500 text-center max-w-md mx-auto">${safeText(share.error || '该分享资源启用了额外保护，输入正确密码后即可查看内容。')}</p>
                      <form data-form="share-password" class="mt-6 max-w-xs mx-auto grid gap-3">
                        <input class="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-sky-500 text-slate-800" type="password" name="password" value="${escapeHtml(share.password)}" placeholder="输入分享密码">
                        <button class="w-full px-4 py-2 text-sm font-semibold text-white bg-sky-600 rounded-lg hover:bg-sky-700 transition-colors" type="submit">解锁分享</button>
                      </form>
                    </div>
                  </div>
                `
                : item
                  ? `
                    <div class="flex items-center gap-3 px-4 py-3 rounded-xl bg-slate-50 border border-slate-200">
                      <span class="w-2 h-2 rounded-full bg-sky-600"></span>
                      <span class="text-sm font-semibold text-slate-800">${safeText(item.name)} · ${safeText(item.sizeFormatted)}</span>
                    </div>
                    <div class="flex-1 min-h-[320px] rounded-xl overflow-hidden bg-slate-50 border border-slate-200">
                      ${renderSharePreview(share.token, item)}
                    </div>
                  `
                  : renderEmptyState('等待分享链接', '当前页面没有读取到分享 token，可通过 share.html?token=你的分享码 打开。', icons.file)
        }
      </div>
    `;
  }

  return {
    renderAdminPage,
    renderSharePage,
  };
}
