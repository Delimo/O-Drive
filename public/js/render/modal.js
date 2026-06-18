export function createModalRenderers(deps) {
  const {
    icons,
    escapeHtml,
    getEntryPath,
    apiClient,
    renderMarkdown,
    isMarkdownName,
  } = deps;

  function renderPreviewModalBody(modal) {
    if (modal.loading) return `<div class="empty-state"><div><div class="empty-orb">${icons.refresh}</div><h3 class="empty-title">正在准备预览</h3><p class="empty-copy">正在读取文件内容，请稍候。</p></div></div>`;
    if (modal.error) return `<div class="empty-state"><div><div class="empty-orb">${icons.lock}</div><h3 class="empty-title">预览失败</h3><p class="empty-copy">${escapeHtml(modal.error)}</p></div></div>`;
    const previewUrl = apiClient.previewUrl(getEntryPath(modal.entry));
    if (modal.contentMode === 'image') return `<div class="preview-media-shell"><img src="${previewUrl}" alt="${escapeHtml(modal.entry?.name || '')}"></div>`;
    if (modal.contentMode === 'video') return `<div class="preview-media-shell"><video src="${previewUrl}" controls autoplay playsinline></video></div>`;
    if (modal.contentMode === 'audio') return `<div class="preview-media-shell"><audio src="${previewUrl}" controls autoplay style="width:min(560px,100%);"></audio></div>`;
    if (modal.contentMode === 'pdf') return `<div class="preview-media-shell"><iframe src="${previewUrl}" title="${escapeHtml(modal.entry?.name || '')}"></iframe></div>`;
    if (modal.editing) return `<textarea class="preview-editor" id="preview-edit-area">${escapeHtml(modal.draftContent ?? modal.content ?? '')}</textarea>`;
    if (isMarkdownName(modal.entry?.name) && !modal.showRaw) {
      return `<div class="markdown-body">${renderMarkdown(modal.content || '')}</div>`;
    }
    return `<pre class="preview-text">${escapeHtml(modal.content || '')}</pre>`;
  }

  function renderModal(state) {
    const modal = state.app.modal;
    if (!modal) return '';

    if (modal.type === 'login') {
      const values = modal.values || {};
      return `
        <div class="modal-wrap" data-action="close-modal-backdrop">
          <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="login-title" data-stop-close="true">
            <h3 id="login-title" class="modal-title">管理员登录</h3>
            <p class="modal-copy">输入后台账号信息后，即可使用上传、新建文件夹、回收站与管理概览功能。</p>
            <form class="modal-form" data-form="login">
              <input class="inline-input" name="username" placeholder="用户名" value="${escapeHtml(values.username || '')}">
              <input class="inline-input" type="password" name="password" placeholder="密码" value="${escapeHtml(values.password || '')}">
              ${modal.error ? `<div class="error-text">${escapeHtml(modal.error)}</div>` : '<div class="helper-text">登录成功后会自动刷新当前页面的数据权限。</div>'}
              <div class="btn-row" style="margin-top:6px;">
                <button class="btn btn-primary" type="submit" ${modal.loading ? 'disabled' : ''}>${modal.loading ? '登录中...' : '登录'}</button>
                <button class="btn" type="button" data-action="close-modal">取消</button>
              </div>
            </form>
          </div>
        </div>
      `;
    }

    if (modal.type === 'folder') {
      const values = modal.values || {};
      return `
        <div class="modal-wrap" data-action="close-modal-backdrop">
          <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="folder-title" data-stop-close="true">
            <h3 id="folder-title" class="modal-title">新建文件夹</h3>
            <p class="modal-copy">在当前文件夹下创建一个新的文件夹，你可以随后继续上传文件或整理层级。</p>
            <form class="modal-form" data-form="folder">
              <input class="inline-input" name="folderName" placeholder="例如：品牌素材 / 2026 归档" value="${escapeHtml(values.folderName || '')}">
              ${modal.error ? `<div class="error-text">${escapeHtml(modal.error)}</div>` : '<div class="helper-text">名称会直接作为路径的一部分，请尽量简洁清晰。</div>'}
              <div class="btn-row" style="margin-top:6px;">
                <button class="btn btn-primary" type="submit">创建文件夹</button>
                <button class="btn" type="button" data-action="close-modal">取消</button>
              </div>
            </form>
          </div>
        </div>
      `;
    }

    if (modal.type === 'rename') {
      const values = modal.values || {};
      return `
        <div class="modal-wrap" data-action="close-modal-backdrop">
          <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="rename-title" data-stop-close="true">
            <h3 id="rename-title" class="modal-title">重命名资源</h3>
            <p class="modal-copy">新的名称会直接应用到当前文件或文件夹。请保持名称清晰，并避免与同层级项目重名。</p>
            <form class="modal-form" data-form="rename">
              <input class="inline-input" name="newName" placeholder="输入新的名称" value="${escapeHtml(values.newName || modal.entry?.name || '')}">
              ${modal.error ? `<div class="error-text">${escapeHtml(modal.error)}</div>` : '<div class="helper-text">重命名会保持当前路径层级不变，只修改当前项目名称。</div>'}
              <div class="btn-row" style="margin-top:6px;">
                <button class="btn btn-primary" type="submit">确认重命名</button>
                <button class="btn" type="button" data-action="close-modal">取消</button>
              </div>
            </form>
          </div>
        </div>
      `;
    }

    if (modal.type === 'share') {
      const values = modal.values || {};
      return `
        <div class="modal-wrap" data-action="close-modal-backdrop">
          <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="share-title" data-stop-close="true">
            <h3 id="share-title" class="modal-title">创建分享链接</h3>
            <p class="modal-copy">你正在为 ${escapeHtml(modal.entry?.name || '当前文件')} 生成对外分享地址，可控制有效期、下载次数与访问密码。</p>
            <form class="modal-form" data-form="share">
              <div class="form-grid">
                <input class="inline-input" name="expiresInDays" type="number" min="0" max="3650" placeholder="有效期天数" value="${escapeHtml(values.expiresInDays || '7')}">
                <input class="inline-input" name="maxDownloads" type="number" min="0" max="1000000" placeholder="最大下载次数，0 为不限" value="${escapeHtml(values.maxDownloads || '0')}">
                <input class="inline-input" name="password" type="text" placeholder="访问密码，可留空" value="${escapeHtml(values.password || '')}">
                <label class="check-row"><input type="checkbox" name="allowPreview" ${values.allowPreview !== false ? 'checked' : ''}>允许在线预览</label>
                <label class="check-row"><input type="checkbox" name="allowDownload" ${values.allowDownload !== false ? 'checked' : ''}>允许下载文件</label>
              </div>
              ${modal.error ? `<div class="error-text">${escapeHtml(modal.error)}</div>` : '<div class="helper-text">创建成功后会自动复制分享链接到剪贴板。</div>'}
              <div class="btn-row" style="margin-top:6px;">
                <button class="btn btn-primary" type="submit">生成分享</button>
                <button class="btn" type="button" data-action="close-modal">取消</button>
              </div>
            </form>
          </div>
        </div>
      `;
    }

    if (modal.type === 'unlock-path') {
      return `
        <div class="modal-wrap" data-action="close-modal-backdrop">
          <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="unlock-title" data-stop-close="true">
            <h3 id="unlock-title" class="modal-title">输入访问密码</h3>
            <p class="modal-copy">当前资源受路径保护。输入正确密码后，会继续执行刚才的操作。</p>
            <form class="modal-form" data-form="unlock-path">
              <div class="helper-text">目标路径：${escapeHtml(modal.path || '')}</div>
              <input class="inline-input" name="password" type="password" placeholder="输入访问密码">
              ${modal.error ? `<div class="error-text">${escapeHtml(modal.error)}</div>` : '<div class="helper-text">验证通过后会自动继续预览、下载或进入文件夹。</div>'}
              <div class="btn-row" style="margin-top:6px;">
                <button class="btn btn-primary" type="submit">解锁并继续</button>
                <button class="btn" type="button" data-action="close-modal">取消</button>
              </div>
            </form>
          </div>
        </div>
      `;
    }

    if (modal.type === 'preview') {
      const showMarkdownToggle = isMarkdownName(modal.entry?.name) && modal.contentMode === 'text' && !modal.loading && !modal.error && !modal.editing;
      return `
        <div class="modal-wrap" data-action="close-modal-backdrop">
          <div class="modal-card preview-modal" role="dialog" aria-modal="true" aria-labelledby="preview-title" data-stop-close="true">
            <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:16px;">
              <div>
                <h3 id="preview-title" class="modal-title">${escapeHtml(modal.entry?.name || '在线预览')}</h3>
                <p class="modal-copy">${escapeHtml(getEntryPath(modal.entry) || '')}</p>
              </div>
              <div class="btn-row">
                ${modal.editable && modal.editing ? `<span class="preview-edit-meta" data-dirty="${modal.dirty ? 'true' : 'false'}">${modal.dirty ? '● 未保存' : '已是最新'}</span>` : ''}
                ${showMarkdownToggle ? `<button class="btn" data-action="toggle-markdown-raw">${modal.showRaw ? '渲染视图' : '查看原文'}</button>` : ''}
                ${modal.editable ? `<button class="btn" data-action="toggle-preview-edit">${modal.editing ? '退出编辑' : '编辑文本'}</button>` : ''}
                ${modal.editable && modal.editing ? `<button class="btn btn-primary" data-action="save-preview-edit"><span class="icon">${icons.save}</span>保存</button>` : ''}
                <button class="btn" data-action="close-modal"><span class="icon">${icons.close}</span>关闭</button>
              </div>
            </div>
            <div class="preview-modal-body">
              ${renderPreviewModalBody(modal)}
            </div>
          </div>
        </div>
      `;
    }

    if (modal.type === 'confirm-delete-share') {
      const shareName = modal.shareName || '此分享';
      return `
        <div class="modal-wrap" data-action="close-modal-backdrop">
          <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="confirm-delete-title" data-stop-close="true">
            <h3 id="confirm-delete-title" class="modal-title">确认删除分享</h3>
            <p class="modal-copy">你确定要删除分享"${escapeHtml(shareName)}"吗？</p>
            <div class="attention-item" data-level="warning" style="margin:16px 0;">
              <h3 class="attention-title">此操作不可撤销</h3>
              <div class="attention-copy">删除后，分享链接将立即失效，所有访问者将无法再通过此链接访问文件。</div>
            </div>
            ${modal.error ? `<div class="error-text" style="margin:12px 0;">${escapeHtml(modal.error)}</div>` : ''}
            ${modal.loading ? '<div class="helper-text" style="margin:12px 0;">正在删除分享，请稍候...</div>' : ''}
            <div class="btn-row" style="margin-top:6px;">
              <button class="btn btn-danger" type="button" data-action="execute-delete-share" data-key="${escapeHtml(modal.token || '')}" ${modal.loading ? 'disabled' : ''}>
                ${icons.trash}
                <span>${modal.loading ? '删除中...' : '确认删除'}</span>
              </button>
              <button class="btn" type="button" data-action="close-modal" ${modal.loading ? 'disabled' : ''}>取消</button>
            </div>
          </div>
        </div>
      `;
    }

    if (modal.type === 'confirm-clear-trash') {
      return `
        <div class="modal-wrap" data-action="close-modal-backdrop">
          <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="confirm-clear-title" data-stop-close="true">
            <h3 id="confirm-clear-title" class="modal-title">清空回收站</h3>
            <p class="modal-copy">你确定要清空回收站中的所有项目吗？此操作将永久删除所有回收站中的文件和文件夹。</p>
            <div class="attention-item" data-level="warning" style="margin:16px 0;">
              <h3 class="attention-title">此操作不可撤销</h3>
              <div class="attention-copy">清空后，所有回收站中的项目将被永久删除，无法恢复。请确认你不再需要这些文件。</div>
            </div>
            ${modal.error ? `<div class="error-text" style="margin:12px 0;">${escapeHtml(modal.error)}</div>` : ''}
            ${modal.loading ? '<div class="helper-text" style="margin:12px 0;">正在清空回收站，请稍候...</div>' : ''}
            <div class="btn-row" style="margin-top:6px;">
              <button class="btn btn-danger" type="button" data-action="execute-clear-trash" ${modal.loading ? 'disabled' : ''}>
                ${icons.trash}
                <span>${modal.loading ? '清空中...' : '确认清空'}</span>
              </button>
              <button class="btn" type="button" data-action="close-modal" ${modal.loading ? 'disabled' : ''}>取消</button>
            </div>
          </div>
        </div>
      `;
    }

    if (modal.type === 'confirm-cleanup-expired') {
      return `
        <div class="modal-wrap" data-action="close-modal-backdrop">
          <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="confirm-cleanup-title" data-stop-close="true">
            <h3 id="confirm-cleanup-title" class="modal-title">清理过期分享</h3>
            <p class="modal-copy">你确定要清理所有已过期的分享记录吗？</p>
            <div class="attention-item" data-level="warning" style="margin:16px 0;">
              <h3 class="attention-title">此操作不可撤销</h3>
              <div class="attention-copy">清理后，所有已过期的分享记录将被永久删除，相关链接将立即失效。</div>
            </div>
            ${modal.error ? `<div class="error-text" style="margin:12px 0;">${escapeHtml(modal.error)}</div>` : ''}
            ${modal.loading ? '<div class="helper-text" style="margin:12px 0;">正在清理过期分享，请稍候...</div>' : ''}
            <div class="btn-row" style="margin-top:6px;">
              <button class="btn btn-danger" type="button" data-action="execute-cleanup-expired-shares" ${modal.loading ? 'disabled' : ''}>
                ${icons.trash}
                <span>${modal.loading ? '清理中...' : '确认清理'}</span>
              </button>
              <button class="btn" type="button" data-action="close-modal" ${modal.loading ? 'disabled' : ''}>取消</button>
            </div>
          </div>
        </div>
      `;
    }

    return '';
  }

  function renderToast(state) {
    if (!state.app.toast) return '';
    return `
      <div class="toast-wrap">
        <div class="toast" data-type="${escapeHtml(state.app.toast.type || 'info')}">${escapeHtml(state.app.toast.message || '')}</div>
      </div>
    `;
  }

  return {
    renderModal,
    renderPreviewModalBody,
    renderToast,
  };
}
