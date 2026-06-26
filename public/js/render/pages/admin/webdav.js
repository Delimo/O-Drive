/**
 * WebDAV management tab renderer.
 * Shows WebDAV status, connection info, and usage instructions.
 */
export function createWebdavRenderer({
  safeText, escapeHtml, renderEmptyStateCompact, components
}) {

  function renderWebdavSection(admin) {
    const healthData = admin.health || {};
    const davEnabled = healthData.env?.davEnabled || false;
    const origin = typeof location !== 'undefined' ? location.origin : '';
    const davUrl = origin ? `${origin}/dav/` : '/dav/';

    return `
      <div class="ov-webdav">
        <div class="ov-webdav-header">
          <div class="ov-webdav-title-group">
            <h2 class="ov-webdav-title">WebDAV</h2>
            <span class="ov-badge ${davEnabled ? 'ov-badge-ok' : 'ov-badge-info'}">
              ${davEnabled ? '已启用' : '未配置'}
            </span>
          </div>
          <button class="btn btn-sm" type="button" data-action="refresh-admin-health">刷新</button>
        </div>

        ${davEnabled ? `
          <div class="ov-webdav-grid">
            <div class="ov-webdav-conn">
              <div class="ov-webdav-conn-title">连接信息</div>
              <div class="ov-webdav-conn-row">
                <span class="ov-webdav-conn-label">地址</span>
                <code class="ov-webdav-conn-value" data-action="copy-webdav-url" data-url="${escapeHtml(davUrl)}">${escapeHtml(davUrl)}</code>
                <button class="btn btn-sm" type="button" data-action="copy-webdav-url" data-url="${escapeHtml(davUrl)}">复制</button>
              </div>
              <div class="ov-webdav-conn-row">
                <span class="ov-webdav-conn-label">用户名</span>
                <span class="ov-webdav-conn-value">管理员用户名</span>
              </div>
              <div class="ov-webdav-conn-row">
                <span class="ov-webdav-conn-label">密码</span>
                <span class="ov-webdav-conn-value">管理员密码</span>
              </div>
            </div>

            <div class="ov-webdav-clients">
              <div class="ov-webdav-clients-title">客户端</div>
              <div class="ov-webdav-client-item">
                <span class="ov-webdav-client-name">Windows</span>
                <span class="ov-webdav-client-steps">此电脑 → 右键 → 添加网络位置</span>
              </div>
              <div class="ov-webdav-client-item">
                <span class="ov-webdav-client-name">macOS</span>
                <span class="ov-webdav-client-steps">前往 → 连接服务器</span>
              </div>
              <div class="ov-webdav-client-item">
                <span class="ov-webdav-client-name">rclone</span>
                <code class="ov-webdav-cmd">rclone config create odrive webdav url ${escapeHtml(davUrl)} user admin pass &lt;密码&gt;</code>
              </div>
            </div>
          </div>

          <div class="ov-webdav-ops">
            <span class="ov-webdav-ops-label">支持：</span>
            <span class="ov-webdav-op">浏览</span>
            <span class="ov-webdav-op">下载</span>
            <span class="ov-webdav-op">上传</span>
            <span class="ov-webdav-op">删除</span>
            <span class="ov-webdav-op">新建</span>
            <span class="ov-webdav-op">移动</span>
            <span class="ov-webdav-op">复制</span>
            <span class="ov-webdav-ops-sep">|</span>
            <span class="ov-webdav-ops-note">DAV Level 1，无 LOCK，单次 PUT ≤100MB</span>
          </div>
        ` : `
          <div class="ov-webdav-empty">
            <div class="ov-webdav-empty-icon">🔒</div>
            <div class="ov-webdav-empty-text">配置 <code>ADMIN_USERNAME</code> 和 <code>ADMIN_PASSWORD</code> 环境变量即可启用</div>
          </div>
        `}
      </div>
    `;
  }

  return {
    renderWebdavSection,
  };
}
