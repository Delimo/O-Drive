import { adminState } from './admin-state.js';
import { api } from './api.js';
import { escapeHtml } from './utils.js';

function setMaintenanceResult(text = '') {
  ['healthMaintenanceResult', 'logMaintenanceResult'].forEach(id => {
    const label = document.getElementById(id);
    if (!label) return;
    label.textContent = text;
    label.classList.toggle('hidden', !text);
  });
}

function summarizeD1Tables(tables = []) {
  if (!Array.isArray(tables) || !tables.length) {
    return '所需表会在功能首次使用时自动创建';
  }
  const coreTables = ['settings', 'logs', 'file_index', 'trash', 'share_links', 'path_passwords', 'webhook_deliveries'];
  const readyCount = coreTables.filter(name => tables.includes(name)).length;
  return `已存在 ${tables.length} 张表，核心表 ${readyCount}/${coreTables.length} 已就绪`;
}

function healthItem(label, ok, detail = '') {
  return `
    <div class="health-item ${ok ? 'is-ok' : 'is-bad'}">
      <div>
        <strong>${escapeHtml(label)}</strong>
        ${detail ? `<span>${escapeHtml(detail)}</span>` : ''}
      </div>
      <em>${ok ? '正常' : '异常'}</em>
    </div>
  `;
}

function adminCredentialsHealthItem(usernameOk, passwordOk, guestEnabled, tokenSecret = {}) {
  const tokenSecretOk = Boolean(tokenSecret.configured && tokenSecret.recommended);
  const rows = [
    ['管理员用户名', usernameOk, '环境变量 ADMIN_USERNAME'],
    ['管理员密码', passwordOk, '环境变量 ADMIN_PASSWORD'],
    ['签名密钥', tokenSecretOk, tokenSecret.configured ? 'TOKEN_SECRET 已配置' : '建议配置 TOKEN_SECRET，当前回退到 ADMIN_PASSWORD'],
    ['访客访问', true, guestEnabled ? 'ALLOW_GUEST=true，访客可浏览' : '默认关闭；只有 ALLOW_GUEST=true 才开启'],
  ];

  return rows.map(([label, ok, detail]) => healthItem(label, ok, detail)).join('');
}

function maintenanceItem(label, value, detail = '') {
  return `
    <div class="health-item is-ok">
      <div>
        <strong>${escapeHtml(label)}</strong>
        ${detail ? `<span>${escapeHtml(detail)}</span>` : ''}
      </div>
      <em>${escapeHtml(String(value))}</em>
    </div>
  `;
}

export function createAdminHealthActions({ adminConfirm }) {
  return {
    async loadHealth() {
      const grid = document.getElementById('healthGrid');
      if (!grid) return;
      grid.innerHTML = '<div class="text-sm text-slate-500">正在检查...</div>';
      const { res, data } = await api.adminHealth();
      if (!res.ok) {
        grid.innerHTML = '<div class="text-sm text-rose-600 font-bold">环境检查失败，请重新登录后再试。</div>';
        return;
      }

      const tableList = summarizeD1Tables(data.db?.tables);
      const warnings = Array.isArray(data.warnings) ? data.warnings : [];
      const warningsHtml = warnings.length
        ? `
          <div class="health-item health-item-wide is-bad">
            <div>
              <strong>系统提醒</strong>
              <span>${escapeHtml(warnings.map(item => `${item.source}: ${item.message}`).join('；'))}</span>
            </div>
            <em>${warnings.length} 条</em>
          </div>
        `
        : '';

      grid.innerHTML = [
        healthItem('D1 数据库绑定 D1', Boolean(data.db?.ok), data.db?.message || tableList),
        healthItem('R2 存储绑定 R2', Boolean(data.r2?.ok), data.r2?.message || '文件读写使用该 Bucket'),
        adminCredentialsHealthItem(Boolean(data.env?.adminUsername), Boolean(data.env?.adminPassword), Boolean(data.env?.guestEnabled), data.env?.tokenSecret || {}),
        warningsHtml,
      ].join('');
    },

    async loadMaintenance() {
      const grids = ['healthMaintenanceGrid']
        .map(id => document.getElementById(id))
        .filter(Boolean);
      if (!grids.length) return;
      grids.forEach(grid => {
        grid.innerHTML = '<div class="text-sm text-slate-500">正在检查...</div>';
      });
      const { res, data } = await api.maintenance();
      if (!res.ok) {
        grids.forEach(grid => {
          grid.innerHTML = '<div class="text-sm text-rose-600 font-bold">维护信息加载失败。</div>';
        });
        return;
      }
      const latestIndexUpdate = data.indexLatestUpdatedAt
        ? new Date(data.indexLatestUpdatedAt).toLocaleString('zh-CN', { hour12: false })
        : '尚未更新';
      const indexDetail = data.r2SampleTruncated
        ? `索引占用 ${data.indexTotalSizeFormatted || '0 B'}，R2 抽样已达上限`
        : `R2 当前抽样 ${data.r2SampleCount || 0} 个可见文件`;
      const html = [
        maintenanceItem('文件索引记录', data.indexCount || 0, indexDetail),
        maintenanceItem('索引最后更新', latestIndexUpdate, data.indexFresh ? '索引与当前抽样一致' : '建议重建文件索引'),
        maintenanceItem('访问失败记录', data.accessAttemptCount || 0, '受保护路径的密码错误记录'),
        maintenanceItem('回收站记录', data.trashCount || 0, '可回收站占用 R2 空间'),
        maintenanceItem('操作日志', data.logsCount || 0, '管理员操作记录'),
        maintenanceItem('缩略图缓存', data.thumbnailsPresent ? '有' : '无', '.thumbs/ 系统前缀'),
      ].join('');
      grids.forEach(grid => { grid.innerHTML = html; });
    },

    async runMaintenanceAction(action) {
      const names = {
        'rebuild-index': ['重建文件索引？', '重建会重新扫描 R2 文件并刷新统计索引。'],
        'cleanup-access-attempts': ['清理访问失败记录？', '这会移除受保护路径的密码错误计数。'],
        'cleanup-thumbnails': ['清理缩略图缓存？', '缩略图会在后续预览时重新生成。'],
        'cleanup-logs': ['清理旧操作日志？', '将保留最近 2000 条和最近 90 天内的操作日志。'],
      };
      const confirmText = names[action];
      if (confirmText && !(await adminConfirm(confirmText[0], confirmText[1]))) return;
      setMaintenanceResult('正在执行...');
      const { res, data } = await api.maintenanceAction(action);
      if (!res.ok || data?.success === false) {
        setMaintenanceResult(data?.message || '维护操作失败');
        return;
      }
      const summary = data.synced != null
        ? `已同步 ${data.synced} 个文件${data.truncated ? '（已达扫描上限）' : ''}`
        : `已清理 ${data.deleted || 0} 项${data.truncated ? '（已达扫描上限）' : ''}`;
      setMaintenanceResult(summary);
      await this.loadMaintenance();
      if (adminState.activeTab === 'overview') await this.loadStats();
      if (adminState.activeTab === 'logs') await this.loadLogs();
    },
  };
}
