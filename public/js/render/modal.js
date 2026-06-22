export function createModalRenderers(deps) {
  const {
    icons,
    escapeHtml,
    getEntryPath,
    apiClient,
    renderMarkdown,
    isMarkdownName,
    formatBytes,
  } = deps;

  function renderPreviewModalBody(modal) {
    if (modal.loading)
      return `<div class="empty-state"><div><div class="empty-orb">${icons.spinner}</div><h3 class="empty-title">正在准备预览</h3><p class="empty-copy">正在读取文件内容，请稍候。</p></div></div>`;
    if (modal.error)
      return `<div class="empty-state"><div><div class="empty-orb">${icons.lock}</div><h3 class="empty-title">预览失败</h3><p class="empty-copy">${escapeHtml(modal.error)}</p></div></div>`;
    const previewUrl = apiClient.previewUrl(getEntryPath(modal.entry));
    if (modal.contentMode === "image")
      return `<div class="preview-media-shell"><img src="${previewUrl}" alt="${escapeHtml(modal.entry?.name || "")}"></div>`;
    if (modal.contentMode === "video")
      return `<div class="preview-media-shell"><video src="${previewUrl}" controls autoplay playsinline></video></div>`;
    if (modal.contentMode === "audio")
      return `<div class="preview-media-shell"><audio src="${previewUrl}" controls autoplay style="width:min(560px,100%);"></audio></div>`;
    if (modal.contentMode === "pdf")
      return `<div class="preview-media-shell"><iframe src="${previewUrl}" title="${escapeHtml(modal.entry?.name || "")}"></iframe></div>`;
    if (modal.editing)
      return `<textarea class="preview-editor" id="preview-edit-area">${escapeHtml(modal.draftContent ?? modal.content ?? "")}</textarea>`;
    if (isMarkdownName(modal.entry?.name) && !modal.showRaw) {
      return `<div class="markdown-body">${renderMarkdown(modal.content || "")}</div>`;
    }
    return `<pre class="preview-text">${escapeHtml(modal.content || "")}</pre>`;
  }

  function renderModal(state) {
    const modal = state.app.modal;
    if (!modal) return "";

    if (modal.type === "login") {
      const values = modal.values || {};
      return `
        <div class="modal-wrap" data-action="close-modal-backdrop">
          <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="login-title" data-stop-close="true">
            <h3 id="login-title" class="modal-title">管理员登录</h3>
            <p class="modal-copy">输入后台账号信息后，即可使用上传、新建文件夹、回收站与管理概览功能。</p>
            <form class="modal-form" data-form="login">
              <input class="inline-input" name="username" placeholder="用户名" value="${escapeHtml(values.username || "")}">
              <input class="inline-input" type="password" name="password" placeholder="密码" value="${escapeHtml(values.password || "")}">
              ${modal.error ? `<div class="error-text">${escapeHtml(modal.error)}</div>` : '<div class="helper-text">登录成功后会自动刷新当前页面的数据权限。</div>'}
              <div class="btn-row" style="margin-top:6px;">
                <button class="btn btn-primary" type="submit" ${modal.loading ? "disabled" : ""}>${modal.loading ? "登录中..." : "登录"}</button>
                <button class="btn" type="button" data-action="close-modal">取消</button>
              </div>
            </form>
          </div>
        </div>
      `;
    }

    if (modal.type === "folder") {
      const values = modal.values || {};
      return `
        <div class="modal-wrap" data-action="close-modal-backdrop">
          <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="folder-title" data-stop-close="true">
            <h3 id="folder-title" class="modal-title">新建文件夹</h3>
            <p class="modal-copy">在当前文件夹下创建一个新的文件夹，你可以随后继续上传文件或整理层级。</p>
            <form class="modal-form" data-form="folder">
              <input class="inline-input" name="folderName" placeholder="例如：品牌素材 / 2026 归档" value="${escapeHtml(values.folderName || "")}">
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

    if (modal.type === "rename") {
      const values = modal.values || {};
      return `
        <div class="modal-wrap" data-action="close-modal-backdrop">
          <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="rename-title" data-stop-close="true">
            <h3 id="rename-title" class="modal-title">重命名资源</h3>
            <p class="modal-copy">新的名称会直接应用到当前文件或文件夹。请保持名称清晰，并避免与同层级项目重名。</p>
            <form class="modal-form" data-form="rename">
              <input class="inline-input" name="newName" placeholder="输入新的名称" value="${escapeHtml(values.newName || modal.entry?.name || "")}">
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

    if (modal.type === "share") {
      const values = modal.values || {};
      return `
        <div class="modal-wrap" data-action="close-modal-backdrop">
          <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="share-title" data-stop-close="true">
            <h3 id="share-title" class="modal-title">创建分享链接</h3>
            <p class="modal-copy">你正在为 ${escapeHtml(modal.entry?.name || "当前文件")} 生成对外分享地址，可控制有效期、下载次数与访问密码。</p>
            <form class="modal-form" data-form="share">
              <div class="form-grid">
                <input class="inline-input" name="expiresInDays" type="number" min="0" max="3650" placeholder="有效期天数" value="${escapeHtml(values.expiresInDays || "7")}">
                <input class="inline-input" name="maxDownloads" type="number" min="0" max="1000000" placeholder="最大下载次数，0 为不限" value="${escapeHtml(values.maxDownloads || "0")}">
                <input class="inline-input" name="password" type="text" placeholder="访问密码，可留空" value="${escapeHtml(values.password || "")}">
                <label class="check-row"><input type="checkbox" name="allowPreview" ${values.allowPreview !== false ? "checked" : ""}>允许在线预览</label>
                <label class="check-row"><input type="checkbox" name="allowDownload" ${values.allowDownload !== false ? "checked" : ""}>允许下载文件</label>
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

    if (modal.type === "unlock-path") {
      return `
        <div class="modal-wrap" data-action="close-modal-backdrop">
          <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="unlock-title" data-stop-close="true">
            <h3 id="unlock-title" class="modal-title">输入访问密码</h3>
            <p class="modal-copy">当前资源受路径保护。输入正确密码后，会继续执行刚才的操作。</p>
            <form class="modal-form" data-form="unlock-path">
              <div class="helper-text">目标路径：${escapeHtml(modal.path || "")}</div>
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

    if (modal.type === "preview") {
      const showMarkdownToggle =
        isMarkdownName(modal.entry?.name) &&
        modal.contentMode === "text" &&
        !modal.loading &&
        !modal.error &&
        !modal.editing;
      return `
        <div class="modal-wrap" data-action="close-modal-backdrop">
          <div class="modal-card preview-modal" role="dialog" aria-modal="true" aria-labelledby="preview-title" data-stop-close="true">
            <div class="modal-header">
              <div class="modal-header-title">
                <h3 id="preview-title" class="modal-title">${escapeHtml(modal.entry?.name || "在线预览")}</h3>
                <p class="modal-copy">${escapeHtml(getEntryPath(modal.entry) || "")}</p>
              </div>
              <div class="modal-header-actions btn-row">
                ${modal.editable && modal.editing ? `<span class="preview-edit-meta" data-dirty="${modal.dirty ? "true" : "false"}">${modal.dirty ? "● 未保存" : "已是最新"}</span>` : ""}
                ${showMarkdownToggle ? `<button class="btn" data-action="toggle-markdown-raw">${modal.showRaw ? "渲染视图" : "查看原文"}</button>` : ""}
                ${modal.editable ? `<button class="btn" data-action="toggle-preview-edit">${modal.editing ? "退出编辑" : "编辑文本"}</button>` : ""}
                ${modal.editable && modal.editing ? `<button class="btn btn-primary" data-action="save-preview-edit"><span class="icon">${icons.save}</span>保存</button>` : ""}
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

    if (modal.type === "confirm-delete-share") {
      const shareName = modal.shareName || "此分享";
      return `
        <div class="modal-wrap" data-action="close-modal-backdrop">
          <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="confirm-delete-title" data-stop-close="true">
            <h3 id="confirm-delete-title" class="modal-title">确认删除分享</h3>
            <p class="modal-copy">你确定要删除分享"${escapeHtml(shareName)}"吗？</p>
            <div class="attention-item" data-level="warning" style="margin:16px 0;">
              <h3 class="attention-title">此操作不可撤销</h3>
              <div class="attention-copy">删除后，分享链接将立即失效，所有访问者将无法再通过此链接访问文件。</div>
            </div>
            ${modal.error ? `<div class="error-text" style="margin:12px 0;">${escapeHtml(modal.error)}</div>` : ""}
            ${modal.loading ? '<div class="helper-text" style="margin:12px 0;">正在删除分享，请稍候...</div>' : ""}
            <div class="btn-row" style="margin-top:6px;">
              <button class="btn btn-danger" type="button" data-action="execute-delete-share" data-key="${escapeHtml(modal.token || "")}" ${modal.loading ? "disabled" : ""}>
                ${icons.trash}
                <span>${modal.loading ? "删除中..." : "确认删除"}</span>
              </button>
              <button class="btn" type="button" data-action="close-modal" ${modal.loading ? "disabled" : ""}>取消</button>
            </div>
          </div>
        </div>
      `;
    }

    if (modal.type === "confirm-clear-trash") {
      return `
        <div class="modal-wrap" data-action="close-modal-backdrop">
          <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="confirm-clear-title" data-stop-close="true">
            <h3 id="confirm-clear-title" class="modal-title">清空回收站</h3>
            <p class="modal-copy">你确定要清空回收站中的所有项目吗？此操作将永久删除所有回收站中的文件和文件夹。</p>
            <div class="attention-item" data-level="warning" style="margin:16px 0;">
              <h3 class="attention-title">此操作不可撤销</h3>
              <div class="attention-copy">清空后，所有回收站中的项目将被永久删除，无法恢复。请确认你不再需要这些文件。</div>
            </div>
            ${modal.error ? `<div class="error-text" style="margin:12px 0;">${escapeHtml(modal.error)}</div>` : ""}
            ${modal.loading ? '<div class="helper-text" style="margin:12px 0;">正在清空回收站，请稍候...</div>' : ""}
            <div class="btn-row" style="margin-top:6px;justify-content:flex-end;">
              <button class="btn btn-danger" type="button" data-action="execute-clear-trash" ${modal.loading ? "disabled" : ""}>
                ${modal.loading ? "清空中..." : "确认清空"}
              </button>
              <button class="btn" type="button" data-action="close-modal" ${modal.loading ? "disabled" : ""}>取消</button>
            </div>
          </div>
        </div>
      `;
    }

    if (modal.type === "add-protected-path") {
      return `
        <div class="modal-wrap" data-action="close-modal-backdrop">
          <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="add-protected-title" data-stop-close="true">
            <h3 id="add-protected-title" class="modal-title">添加受保护路径</h3>
            <p class="modal-copy">设置需要密码才能访问的文件夹，增强数据安全。</p>
            <form class="modal-form" data-form="add-protected-path">
              <input class="inline-input" name="path" placeholder="路径，例如 /文档/私密" value="${escapeHtml(modal.path || "")}" required>
              <input class="inline-input" type="password" name="password" placeholder="访问密码" value="${escapeHtml(modal.password || "")}" required>
              <input class="inline-input" name="showName" placeholder="显示名称（可选）" value="${escapeHtml(modal.showName || "")}">
              <input class="inline-input" name="note" placeholder="备注说明（可选）" value="${escapeHtml(modal.note || "")}">
              ${modal.error ? `<div class="error-text">${escapeHtml(modal.error)}</div>` : '<div class="helper-text">设置后，访问该路径需要输入密码。</div>'}
              <div class="btn-row" style="margin-top:6px;">
                <button class="btn btn-primary" type="submit" ${modal.loading ? "disabled" : ""}>${modal.loading ? "创建中..." : "创建"}</button>
                <button class="btn" type="button" data-action="close-modal">取消</button>
              </div>
            </form>
          </div>
        </div>
      `;
    }

    if (modal.type === "confirm-delete-protected-path") {
      const delPath = modal.path || "";
      return `
        <div class="modal-wrap" data-action="close-modal-backdrop">
          <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="confirm-del-protected-title" data-stop-close="true">
            <h3 id="confirm-del-protected-title" class="modal-title">确认删除受保护路径</h3>
            <p class="modal-copy">你确定要删除路径"${escapeHtml(delPath)}"的访问保护吗？</p>
            <div class="attention-item" data-level="warning" style="margin:16px 0;">
              <h3 class="attention-title">此操作可恢复</h3>
              <div class="attention-copy">删除后，该路径将不再需要密码即可访问。如果需要重新保护，可以再次添加。</div>
            </div>
            ${modal.error ? `<div class="error-text" style="margin:12px 0;">${escapeHtml(modal.error)}</div>` : ""}
            ${modal.loading ? '<div class="helper-text" style="margin:12px 0;">正在删除，请稍候...</div>' : ""}
            <div class="btn-row" style="margin-top:6px;">
              <button class="btn btn-danger" type="button" data-action="execute-delete-protected-path" data-path="${escapeHtml(delPath)}" ${modal.loading ? "disabled" : ""}>
                ${icons.trash}
                <span>${modal.loading ? "删除中..." : "确认删除"}</span>
              </button>
              <button class="btn" type="button" data-action="close-modal" ${modal.loading ? "disabled" : ""}>取消</button>
            </div>
          </div>
        </div>
      `;
    }

    if (modal.type === "add-hidden-path") {
      return `
        <div class="modal-wrap" data-action="close-modal-backdrop">
          <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="add-hidden-title" data-stop-close="true">
            <h3 id="add-hidden-title" class="modal-title">添加隐藏路径</h3>
            <p class="modal-copy">被隐藏的路径对游客不可见，但管理员仍可正常访问。</p>
            <form class="modal-form" data-form="add-hidden-path">
              <input class="inline-input" name="path" placeholder="例如 /.env 或 /config" value="${escapeHtml(modal.path || "")}" required>
              ${modal.error ? `<div class="error-text">${escapeHtml(modal.error)}</div>` : '<div class="helper-text">输入相对于根目录的路径，支持文件和文件夹。</div>'}
              <div class="btn-row" style="margin-top:6px;">
                <button class="btn btn-primary" type="submit" ${modal.loading ? "disabled" : ""}>${modal.loading ? "添加中..." : "添加"}</button>
                <button class="btn" type="button" data-action="close-modal">取消</button>
              </div>
            </form>
          </div>
        </div>
      `;
    }

    if (modal.type === "confirm-delete-hidden-path") {
      const delPath = modal.path || "";
      return `
        <div class="modal-wrap" data-action="close-modal-backdrop">
          <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="confirm-del-hidden-title" data-stop-close="true">
            <h3 id="confirm-del-hidden-title" class="modal-title">确认取消隐藏路径</h3>
            <p class="modal-copy">你确定要取消路径"${escapeHtml(delPath)}"的隐藏状态吗？</p>
            <div class="attention-item" data-level="warning" style="margin:16px 0;">
              <h3 class="attention-title">此操作可恢复</h3>
              <div class="attention-copy">取消隐藏后，该路径将对游客重新可见。如果需要再次隐藏，可以重新添加。</div>
            </div>
            ${modal.error ? `<div class="error-text" style="margin:12px 0;">${escapeHtml(modal.error)}</div>` : ""}
            ${modal.loading ? '<div class="helper-text" style="margin:12px 0;">正在删除，请稍候...</div>' : ""}
            <div class="btn-row" style="margin-top:6px;">
              <button class="btn btn-danger" type="button" data-action="execute-delete-hidden-path" data-path="${escapeHtml(delPath)}" ${modal.loading ? "disabled" : ""}>
                ${icons.trash}
                <span>${modal.loading ? "删除中..." : "确认取消隐藏"}</span>
              </button>
              <button class="btn" type="button" data-action="close-modal" ${modal.loading ? "disabled" : ""}>取消</button>
            </div>
          </div>
        </div>
      `;
    }

    if (modal.type === "edit-storage-quota") {
      return `
        <div class="modal-wrap" data-action="close-modal-backdrop">
          <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="edit-quota-title" data-stop-close="true">
            <h3 id="edit-quota-title" class="modal-title">编辑 R2 存储配额</h3>
            <p class="modal-copy">设置 Cloudflare R2 的总存储容量上限。</p>
            <form class="modal-form" data-form="edit-storage-quota">
              <input class="inline-input" name="r2QuotaBytes" type="number" min="0" placeholder="配额（字节）" value="${escapeHtml(String(modal.r2QuotaBytes || ""))}">
              ${modal.error ? `<div class="error-text">${escapeHtml(modal.error)}</div>` : '<div class="helper-text">设置为 0 表示不限制。保存后对所有上传生效。</div>'}
              <div class="btn-row" style="margin-top:6px;">
                <button class="btn btn-primary" type="submit" ${modal.loading ? "disabled" : ""}>${modal.loading ? "保存中..." : "保存"}</button>
                <button class="btn" type="button" data-action="close-modal">取消</button>
              </div>
            </form>
          </div>
        </div>
      `;
    }

    if (modal.type === "add-storage-space") {
      return `
        <div class="modal-wrap" data-action="close-modal-backdrop">
          <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="add-space-title" data-stop-close="true">
            <h3 id="add-space-title" class="modal-title">添加 S3 存储空间</h3>
            <p class="modal-copy">配置兼容 S3 协议的外部存储空间。</p>
            <form class="modal-form" data-form="add-storage-space">
              <input class="inline-input" name="name" placeholder="名称（必填）" value="${escapeHtml(modal.name || "")}" required>
              <input class="inline-input" name="endpoint" placeholder="Endpoint URL" value="${escapeHtml(modal.endpoint || "")}">
              <input class="inline-input" name="region" placeholder="Region（默认 auto）" value="${escapeHtml(modal.region || "auto")}">
              <input class="inline-input" name="bucket" placeholder="Bucket（必填）" value="${escapeHtml(modal.bucket || "")}" required>
              <input class="inline-input" name="accessKeyId" placeholder="Access Key ID" value="${escapeHtml(modal.accessKeyId || "")}">
              <input class="inline-input" type="password" name="secretAccessKey" placeholder="Secret Access Key" value="${escapeHtml(modal.secretAccessKey || "")}">
              <input class="inline-input" name="prefix" placeholder="前缀（可选，如 odrive/）" value="${escapeHtml(modal.prefix || "")}">
              <input class="inline-input" name="quotaBytes" type="number" min="0" placeholder="配额字节数（0 为不限制）" value="${escapeHtml(String(modal.quotaBytes || ""))}">
              <label class="check-row"><input type="checkbox" name="enabled" ${modal.enabled !== false ? "checked" : ""}>启用</label>
              <label class="check-row"><input type="checkbox" name="overflowTarget" ${modal.overflowTarget ? "checked" : ""}>允许溢出写入</label>
              ${modal.error ? `<div class="error-text">${escapeHtml(modal.error)}</div>` : '<div class="helper-text">建议先测试连接再保存。</div>'}
              <div class="btn-row" style="margin-top:6px;">
                <button class="btn btn-primary" type="submit" ${modal.loading ? "disabled" : ""}>${modal.loading ? "添加中..." : "添加"}</button>
                <button class="btn" type="button" data-action="close-modal">取消</button>
              </div>
            </form>
          </div>
        </div>
      `;
    }

    if (modal.type === "confirm-delete-storage-space") {
      const spaceName = modal.name || modal.id || "";
      return `
        <div class="modal-wrap" data-action="close-modal-backdrop">
          <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="confirm-del-space-title" data-stop-close="true">
            <h3 id="confirm-del-space-title" class="modal-title">确认删除存储空间</h3>
            <p class="modal-copy">你确定要删除存储空间"${escapeHtml(spaceName)}"吗？</p>
            <div class="attention-item" data-level="warning" style="margin:16px 0;">
              <h3 class="attention-title">此操作不可撤销</h3>
              <div class="attention-copy">删除后，该空间的配置信息将被移除，关联的路径绑定也会一并清除。文件本身不会被删除。</div>
            </div>
            ${modal.error ? `<div class="error-text" style="margin:12px 0;">${escapeHtml(modal.error)}</div>` : ""}
            ${modal.loading ? '<div class="helper-text" style="margin:12px 0;">正在删除，请稍候...</div>' : ""}
            <div class="btn-row" style="margin-top:6px;">
              <button class="btn btn-danger" type="button" data-action="execute-delete-storage-space" ${modal.loading ? "disabled" : ""}>
                ${icons.trash}
                <span>${modal.loading ? "删除中..." : "确认删除"}</span>
              </button>
              <button class="btn" type="button" data-action="close-modal" ${modal.loading ? "disabled" : ""}>取消</button>
            </div>
          </div>
        </div>
      `;
    }

    if (modal.type === "add-storage-binding") {
      const options = modal.storageOptions || [];
      return `
        <div class="modal-wrap" data-action="close-modal-backdrop">
          <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="add-binding-title" data-stop-close="true">
            <h3 id="add-binding-title" class="modal-title">添加路径绑定</h3>
            <p class="modal-copy">将指定路径的文件路由到对应的存储空间。</p>
            <form class="modal-form" data-form="add-storage-binding">
              <input class="inline-input" name="path" placeholder="路径，例如 /backup" value="${escapeHtml(modal.path || "")}" required>
              <select class="inline-input" name="storageId" required>
                ${options.map((opt) => `<option value="${escapeHtml(opt.id)}" ${modal.storageId === opt.id ? "selected" : ""}>${escapeHtml(opt.name)}</option>`).join("")}
              </select>
              ${modal.error ? `<div class="error-text">${escapeHtml(modal.error)}</div>` : '<div class="helper-text">绑定后，该路径下的新文件将存储在选定的空间。</div>'}
              <div class="btn-row" style="margin-top:6px;">
                <button class="btn btn-primary" type="submit" ${modal.loading ? "disabled" : ""}>${modal.loading ? "添加中..." : "添加"}</button>
                <button class="btn" type="button" data-action="close-modal">取消</button>
              </div>
            </form>
          </div>
        </div>
      `;
    }

    if (modal.type === "confirm-delete-storage-binding") {
      const bindPath = modal.path || "";
      return `
        <div class="modal-wrap" data-action="close-modal-backdrop">
          <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="confirm-del-binding-title" data-stop-close="true">
            <h3 id="confirm-del-binding-title" class="modal-title">确认删除路径绑定</h3>
            <p class="modal-copy">你确定要删除路径"${escapeHtml(bindPath)}"的存储绑定吗？</p>
            <div class="attention-item" data-level="warning" style="margin:16px 0;">
              <h3 class="attention-title">此操作可恢复</h3>
              <div class="attention-copy">删除后，该路径下的新文件将使用默认存储（R2）。已有文件不受影响。</div>
            </div>
            ${modal.error ? `<div class="error-text" style="margin:12px 0;">${escapeHtml(modal.error)}</div>` : ""}
            ${modal.loading ? '<div class="helper-text" style="margin:12px 0;">正在删除，请稍候...</div>' : ""}
            <div class="btn-row" style="margin-top:6px;">
              <button class="btn btn-danger" type="button" data-action="execute-delete-storage-binding" ${modal.loading ? "disabled" : ""}>
                ${icons.trash}
                <span>${modal.loading ? "删除中..." : "确认删除"}</span>
              </button>
              <button class="btn" type="button" data-action="close-modal" ${modal.loading ? "disabled" : ""}>取消</button>
            </div>
          </div>
        </div>
      `;
    }

    if (modal.type === "add-webhook" || modal.type === "edit-webhook") {
      const isEdit = modal.type === "edit-webhook";
      const eventOptions = [
        "file.uploaded",
        "file.deleted",
        "file.renamed",
        "file.moved",
        "file.copied",
        "folder.created",
        "trash.restored",
        "admin.login_failure",
        "download.burst",
        "share.created",
        "share.deleted",
      ];
      return `
        <div class="modal-wrap" data-action="close-modal-backdrop">
          <div class="modal-card" role="dialog" aria-modal="true" data-stop-close="true" style="width:560px;">
            <h3 class="modal-title">${isEdit ? "编辑" : "添加"} Webhook</h3>
            <p class="modal-copy">配置事件通知的投递端点。</p>
            <form class="modal-form" data-form="${isEdit ? "edit" : "add"}-webhook">
              <input class="inline-input" name="name" placeholder="名称" value="${escapeHtml(modal.name || "")}" required>
              <input class="inline-input" name="url" placeholder="Webhook URL" value="${escapeHtml(modal.url || "")}" required>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                <select class="inline-input" name="msgtype">
                  ${["json", "text", "markdown"].map((t) => `<option value="${t}" ${modal.msgtype === t ? "selected" : ""}>${t}</option>`).join("")}
                </select>
                <select class="inline-input" name="method">
                  ${["POST", "PUT", "PATCH", "GET", "DELETE"].map((m) => `<option value="${m}" ${modal.method === m ? "selected" : ""}>${m}</option>`).join("")}
                </select>
              </div>
              <input class="inline-input" name="contentType" placeholder="Content-Type" value="${escapeHtml(modal.contentType || "application/json")}">
              <textarea class="inline-input" name="headers" placeholder="自定义 Headers (JSON)" rows="2" style="resize:vertical;">${escapeHtml(modal.headers || "")}</textarea>
              <textarea class="inline-input" name="body" placeholder="请求体模板（可选）" rows="2" style="resize:vertical;">${escapeHtml(modal.body || "")}</textarea>
              <input class="inline-input" name="events" placeholder="事件类型（逗号分隔）" value="${escapeHtml((modal.events || []).join(", "))}">
              <div style="font-size:12px;color:var(--muted);margin:-4px 0 8px;">可选事件：${eventOptions.join(", ")}</div>
              <label class="check-row"><input type="checkbox" name="enabled" ${modal.enabled !== false ? "checked" : ""}>启用</label>
              ${modal.error ? `<div class="error-text">${escapeHtml(modal.error)}</div>` : '<div class="helper-text">支持事件变量：{{event}}、{{message}}、{{path}} 等。</div>'}
              <div class="btn-row" style="margin-top:6px;">
                <button class="btn btn-primary" type="submit" ${modal.loading ? "disabled" : ""}>${modal.loading ? "保存中..." : isEdit ? "保存" : "添加"}</button>
                <button class="btn" type="button" data-action="close-modal">取消</button>
              </div>
            </form>
          </div>
        </div>
      `;
    }

    if (modal.type === "confirm-delete-webhook") {
      const whName = modal.name || modal.id || "";
      return `
        <div class="modal-wrap" data-action="close-modal-backdrop">
          <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="confirm-del-wh-title" data-stop-close="true">
            <h3 id="confirm-del-wh-title" class="modal-title">确认删除 Webhook</h3>
            <p class="modal-copy">你确定要删除 Webhook"${escapeHtml(whName)}"吗？</p>
            <div class="attention-item" data-level="warning" style="margin:16px 0;">
              <h3 class="attention-title">此操作不可撤销</h3>
              <div class="attention-copy">删除后，该 Webhook 将立即停止投递事件通知。</div>
            </div>
            ${modal.error ? `<div class="error-text" style="margin:12px 0;">${escapeHtml(modal.error)}</div>` : ""}
            ${modal.loading ? '<div class="helper-text" style="margin:12px 0;">正在删除，请稍候...</div>' : ""}
            <div class="btn-row" style="margin-top:6px;">
              <button class="btn btn-danger" type="button" data-action="execute-delete-webhook" ${modal.loading ? "disabled" : ""}>
                ${icons.trash}
                <span>${modal.loading ? "删除中..." : "确认删除"}</span>
              </button>
              <button class="btn" type="button" data-action="close-modal" ${modal.loading ? "disabled" : ""}>取消</button>
            </div>
          </div>
        </div>
      `;
    }

    if (modal.type === "confirm-maintenance-action") {
      const actionLabel = modal.maintenanceLabel || "此操作";
      return `
        <div class="modal-wrap" data-action="close-modal-backdrop">
          <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="confirm-maint-title" data-stop-close="true">
            <h3 id="confirm-maint-title" class="modal-title">确认执行：${escapeHtml(actionLabel)}</h3>
            <p class="modal-copy">你确定要执行维护操作"${escapeHtml(actionLabel)}"吗？</p>
            <div class="attention-item" data-level="warning" style="margin:16px 0;">
              <h3 class="attention-title">此操作可能需要一定时间</h3>
              <div class="attention-copy">执行过程中请勿刷新页面。操作完成后会自动刷新维护快照。</div>
            </div>
            ${modal.error ? `<div class="error-text" style="margin:12px 0;">${escapeHtml(modal.error)}</div>` : ""}
            ${modal.loading ? '<div class="helper-text" style="margin:12px 0;">正在执行，请稍候...</div>' : ""}
            <div class="btn-row" style="margin-top:6px;">
              <button class="btn btn-danger" type="button" data-action="execute-maintenance-action" ${modal.loading ? "disabled" : ""}>
                ${icons.trash}
                <span>${modal.loading ? "执行中..." : "确认执行"}</span>
              </button>
              <button class="btn" type="button" data-action="close-modal" ${modal.loading ? "disabled" : ""}>取消</button>
            </div>
          </div>
        </div>
      `;
    }

    if (modal.type === "confirm-cleanup-expired") {
      return `
        <div class="modal-wrap" data-action="close-modal-backdrop">
          <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="confirm-cleanup-title" data-stop-close="true">
            <h3 id="confirm-cleanup-title" class="modal-title">清理过期分享</h3>
            <p class="modal-copy">你确定要清理所有已过期的分享记录吗？</p>
            <div class="attention-item" data-level="warning" style="margin:16px 0;">
              <h3 class="attention-title">此操作不可撤销</h3>
              <div class="attention-copy">清理后，所有已过期的分享记录将被永久删除，相关链接将立即失效。</div>
            </div>
            ${modal.error ? `<div class="error-text" style="margin:12px 0;">${escapeHtml(modal.error)}</div>` : ""}
            ${modal.loading ? '<div class="helper-text" style="margin:12px 0;">正在清理过期分享，请稍候...</div>' : ""}
            <div class="btn-row" style="margin-top:6px;">
              <button class="btn btn-danger" type="button" data-action="execute-cleanup-expired-shares" ${modal.loading ? "disabled" : ""}>
                ${icons.trash}
                <span>${modal.loading ? "清理中..." : "确认清理"}</span>
              </button>
              <button class="btn" type="button" data-action="close-modal" ${modal.loading ? "disabled" : ""}>取消</button>
            </div>
          </div>
        </div>
      `;
    }

    if (modal.type === "upload-confirm") {
      const files = modal.files || [];
      const conflictMode = modal.conflictMode || "rename";
      const totalSize = files.reduce((sum, f) => sum + (f.size || 0), 0);
      const fileList = files
        .map(
          (f, idx) => `
        <li style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:10px;background:${idx % 2 === 0 ? "var(--panel-soft)" : "transparent"};transition:background .15s;" onmouseenter="this.style.background='var(--hover-bg)'" onmouseleave="this.style.background='${idx % 2 === 0 ? "var(--panel-soft)" : "transparent"}'">
          <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13.5px;font-weight:500;color:var(--text);">${escapeHtml(f.name)}</span>
          <span style="flex-shrink:0;font-size:12px;color:var(--muted);">${formatBytes(f.size || 0)}</span>
          <button class="upload-row-remove" data-action="remove-pending-file" data-index="${idx}" type="button" style="flex-shrink:0;width:22px;height:22px;border:0;background:transparent;color:var(--muted);cursor:pointer;display:grid;place-items:center;border-radius:6px;font-size:15px;line-height:1;transition:all .15s;" onmouseenter="this.style.background='rgba(192,57,43,0.08)';this.style.color='var(--danger)'" onmouseleave="this.style.background='transparent';this.style.color='var(--muted)'" aria-label="移除">×</button>
        </li>
      `,
        )
        .join("");

      return `
        <div class="modal-wrap" data-action="close-modal-backdrop">
          <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="upload-confirm-title" data-stop-close="true" style="max-width:480px;padding:0;">
            <div style="padding:24px 24px 0;">
              <h3 id="upload-confirm-title" class="modal-title" style="margin:0;">确认上传</h3>
              <p class="modal-copy" style="margin:8px 0 0;">请确认上传内容和冲突策略。</p>
            </div>
            <div style="padding:16px 24px;display:flex;align-items:center;justify-content:space-between;gap:10px;">
              <div style="display:flex;align-items:center;gap:8px;">
                <span style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:8px;background:var(--accent-soft);color:var(--accent-strong);font-size:12px;font-weight:600;">${files.length} 个文件</span>
                <span style="font-size:13px;color:var(--muted);">${formatBytes(totalSize)}</span>
              </div>
              <button class="btn btn-small btn-ghost" type="button" data-action="add-more-files" style="gap:4px;">+ 添加更多</button>
            </div>
            <div style="padding:0 24px;max-height:300px;overflow-y:auto;">
              <ul style="list-style:none;margin:0;padding:0;display:grid;gap:2px;">
                ${fileList}
              </ul>
            </div>
            <div style="padding:12px 24px;border-top:1px solid var(--line);margin-top:8px;">
              <div style="display:flex;align-items:center;gap:10px;">
                <label style="flex-shrink:0;font-size:13px;color:var(--muted);">冲突策略</label>
                <select class="inline-input conflict-select" data-action="set-upload-conflict-mode" style="flex:1;min-height:36px;font-size:13px;">
                  <option value="rename" ${conflictMode === "rename" ? "selected" : ""}>自动重命名</option>
                  <option value="overwrite" ${conflictMode === "overwrite" ? "selected" : ""}>覆盖已有</option>
                  <option value="skip" ${conflictMode === "skip" ? "selected" : ""}>跳过</option>
                </select>
              </div>
            </div>
            <div style="padding:0 24px 20px;display:flex;gap:10px;">
              <button class="btn btn-primary" type="button" data-action="confirm-upload" style="flex:1;min-height:42px;" ${modal.loading || !files.length ? "disabled" : ""}>
                ${modal.loading ? icons.spinner : ""}
                <span>${modal.loading ? "上传中..." : "开始上传"}</span>
              </button>
              <button class="btn" type="button" data-action="cancel-upload-confirm" style="min-height:42px;" ${modal.loading ? "disabled" : ""}>取消</button>
            </div>
          </div>
        </div>
      `;
    }

    return "";
  }

  function renderToast(state) {
    if (!state.app.toast) return "";
    return `
      <div class="toast-wrap">
        <div class="toast" data-type="${escapeHtml(state.app.toast.type || "info")}">${escapeHtml(state.app.toast.message || "")}</div>
      </div>
    `;
  }

  return {
    renderModal,
    renderPreviewModalBody,
    renderToast,
  };
}
