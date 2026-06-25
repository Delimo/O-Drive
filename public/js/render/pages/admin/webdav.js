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
            <p class="ov-webdav-desc">通过文件管理器直接管理文件</p>
          </div>
          <button class="btn" type="button" data-action="refresh-admin-health">
            刷新状态
          </button>
        </div>

        <div class="ov-webdav-body">
          <div class="ov-webdav-status-card">
            <div class="ov-webdav-status-header">
              <span class="ov-webdav-status-title">连接状态</span>
              <span class="ov-badge ${davEnabled ? 'ov-badge-ok' : 'ov-badge-info'}">
                ${davEnabled ? '已启用' : '未配置'}
              </span>
            </div>
            <div class="ov-webdav-status-body">
              ${davEnabled ? `
                <div class="ov-webdav-url-row">
                  <span class="ov-webdav-url-label">WebDAV 地址</span>
                  <code class="ov-webdav-url" data-action="copy-webdav-url" data-url="${escapeHtml(davUrl)}">${escapeHtml(davUrl)}</code>
                  <button class="btn btn-sm" type="button" data-action="copy-webdav-url" data-url="${escapeHtml(davUrl)}">复制</button>
                </div>
                <div class="ov-webdav-creds">
                  <div class="ov-webdav-cred-item">
                    <span class="ov-webdav-cred-label">用户名</span>
                    <span class="ov-webdav-cred-value">管理员用户名</span>
                  </div>
                  <div class="ov-webdav-cred-item">
                    <span class="ov-webdav-cred-label">密码</span>
                    <span class="ov-webdav-cred-value">DAV_TOKEN 的值</span>
                  </div>
                </div>
              ` : `
                <div class="ov-webdav-hint">
                  <p>在环境变量中配置 <code>DAV_TOKEN</code> 即可启用 WebDAV。</p>
                  <p class="ov-webdav-hint-gen">生成令牌：</p>
                  <code class="ov-webdav-cmd">node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"</code>
                </div>
              `}
            </div>
          </div>

          <div class="ov-webdav-clients-card">
            <div class="ov-webdav-clients-header">
              <span class="ov-webdav-clients-title">客户端连接</span>
            </div>
            <div class="ov-webdav-clients-body">
              <div class="ov-webdav-client">
                <div class="ov-webdav-client-name">Windows 资源管理器</div>
                <div class="ov-webdav-client-steps">
                  <p>1. 打开"此电脑"</p>
                  <p>2. 右键空白处 → "添加一个网络位置"</p>
                  <p>3. 输入地址：<code>${escapeHtml(davUrl)}</code></p>
                  <p>4. 输入用户名和密码</p>
                </div>
              </div>
              <div class="ov-webdav-client">
                <div class="ov-webdav-client-name">macOS Finder</div>
                <div class="ov-webdav-client-steps">
                  <p>1. 菜单栏 → 前往 → 连接服务器</p>
                  <p>2. 输入：<code>${escapeHtml(davUrl)}</code></p>
                  <p>3. 输入用户名和密码</p>
                </div>
              </div>
              <div class="ov-webdav-client">
                <div class="ov-webdav-client-name">命令行 (rclone)</div>
                <div class="ov-webdav-client-steps">
                  <code class="ov-webdav-cmd">rclone config create odrive webdav url ${escapeHtml(davUrl)} user admin pass &lt;DAV_TOKEN&gt;</code>
                </div>
              </div>
            </div>
          </div>

          <div class="ov-webdav-ops-card">
            <div class="ov-webdav-ops-header">
              <span class="ov-webdav-ops-title">支持的操作</span>
            </div>
            <div class="ov-webdav-ops-body">
              <div class="ov-webdav-ops-grid">
                <div class="ov-webdav-op">
                  <span class="ov-webdav-op-icon">📂</span>
                  <span class="ov-webdav-op-name">浏览目录</span>
                </div>
                <div class="ov-webdav-op">
                  <span class="ov-webdav-op-icon">⬇️</span>
                  <span class="ov-webdav-op-name">下载文件</span>
                </div>
                <div class="ov-webdav-op">
                  <span class="ov-webdav-op-icon">⬆️</span>
                  <span class="ov-webdav-op-name">上传文件</span>
                </div>
                <div class="ov-webdav-op">
                  <span class="ov-webdav-op-icon">🗑️</span>
                  <span class="ov-webdav-op-name">删除（进回收站）</span>
                </div>
                <div class="ov-webdav-op">
                  <span class="ov-webdav-op-icon">📁</span>
                  <span class="ov-webdav-op-name">新建文件夹</span>
                </div>
                <div class="ov-webdav-op">
                  <span class="ov-webdav-op-icon">↕️</span>
                  <span class="ov-webdav-op-name">移动 / 重命名</span>
                </div>
                <div class="ov-webdav-op">
                  <span class="ov-webdav-op-icon">📋</span>
                  <span class="ov-webdav-op-name">复制</span>
                </div>
              </div>
            </div>
          </div>

          <div class="ov-webdav-limits-card">
            <div class="ov-webdav-limits-header">
              <span class="ov-webdav-limits-title">限制</span>
            </div>
            <div class="ov-webdav-limits-body">
              <ul class="ov-webdav-limits-list">
                <li>不支持 LOCK/UNLOCK（DAV Level 1）</li>
                <li>单次 PUT 上传，免费版请求体上限 100MB，付费版 500MB+</li>
                <li>删除进回收站，需在管理后台手动清理</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  return {
    renderWebdavSection,
  };
}
