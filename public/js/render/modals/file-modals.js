export function createFileModalRenderers({
  icons,
  escapeHtml,
  formatBytes,
  renderFormFeedback,
  renderModalCustomSelect,
}) {
  function renderLoginModal(modal) {
    const values = modal.values || {};
    return `
      <div class="modal-wrap" data-action="close-modal-backdrop">
        <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="login-title" data-stop-close="true">
          <h3 id="login-title" class="modal-title">管理员登录</h3>
          <p class="modal-copy">输入后台账号信息后，即可使用上传、新建文件夹、回收站与管理概览功能。</p>
          <form class="modal-form" data-form="login">
            <input class="inline-input" name="username" placeholder="用户名" value="${escapeHtml(values.username || "")}">
            <input class="inline-input" type="password" name="password" placeholder="密码" value="${escapeHtml(values.password || "")}">
            ${renderFormFeedback(modal.error, "登录成功后会自动刷新当前页面的数据权限。")}
            <div class="btn-row" style="margin-top:6px;">
              <button class="btn btn-primary" type="submit" ${modal.loading ? "disabled" : ""}>${modal.loading ? "登录中..." : "登录"}</button>
              <button class="btn" type="button" data-action="close-modal">取消</button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  function renderFolderModal(modal) {
    const values = modal.values || {};
    return `
      <div class="modal-wrap" data-action="close-modal-backdrop">
        <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="folder-title" data-stop-close="true">
          <h3 id="folder-title" class="modal-title">新建文件夹</h3>
          <p class="modal-copy">在当前文件夹下创建一个新的文件夹，你可以随后继续上传文件或整理层级。</p>
          <form class="modal-form" data-form="folder">
            <input class="inline-input" name="folderName" placeholder="例如：品牌素材 / 2026 归档" value="${escapeHtml(values.folderName || "")}">
            ${renderFormFeedback(modal.error, "名称会直接作为路径的一部分，请尽量简洁清晰。")}
            <div class="btn-row" style="margin-top:6px;">
              <button class="btn btn-primary" type="submit">创建文件夹</button>
              <button class="btn" type="button" data-action="close-modal">取消</button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  function renderRenameModal(modal) {
    const values = modal.values || {};
    return `
      <div class="modal-wrap" data-action="close-modal-backdrop">
        <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="rename-title" data-stop-close="true">
          <h3 id="rename-title" class="modal-title">重命名资源</h3>
          <p class="modal-copy">新的名称会直接应用到当前文件或文件夹。请保持名称清晰，并避免与同层级项目重名。</p>
          <form class="modal-form" data-form="rename">
            <input class="inline-input" name="newName" placeholder="输入新的名称" value="${escapeHtml(values.newName || modal.entry?.name || "")}">
            ${renderFormFeedback(modal.error, "重命名会保持当前路径层级不变，只修改当前项目名称。")}
            <div class="btn-row" style="margin-top:6px;">
              <button class="btn btn-primary" type="submit">确认重命名</button>
              <button class="btn" type="button" data-action="close-modal">取消</button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  function renderUnlockPathModal(modal) {
    return `
      <div class="modal-wrap" data-action="close-modal-backdrop">
        <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="unlock-title" data-stop-close="true">
          <h3 id="unlock-title" class="modal-title">输入访问密码</h3>
          <p class="modal-copy">当前资源受路径保护。输入正确密码后，会继续执行刚才的操作。</p>
          <form class="modal-form" data-form="unlock-path">
            <div class="helper-text">目标路径：${escapeHtml(modal.path || "")}</div>
            <input class="inline-input" name="password" type="password" placeholder="输入访问密码">
            ${renderFormFeedback(modal.error, "验证通过后会自动继续预览、下载或进入文件夹。")}
            <div class="btn-row" style="margin-top:6px;">
              <button class="btn btn-primary" type="submit">解锁并继续</button>
              <button class="btn" type="button" data-action="close-modal">取消</button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  function renderUploadConfirmModal(modal) {
    const files = modal.files || [];
    const conflictMode = modal.conflictMode || "rename";
    const totalSize = files.reduce((sum, file) => sum + (file.size || 0), 0);
    const fileList = files
      .map(
        (file, index) => `
      <li class="upload-pending-row" style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:10px;background:${index % 2 === 0 ? "var(--panel-soft)" : "transparent"};transition:background .15s;">
        <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13.5px;font-weight:500;color:var(--text);">${escapeHtml(file.name)}</span>
        <span style="flex-shrink:0;font-size:12px;color:var(--muted);">${formatBytes(file.size || 0)}</span>
        <button class="upload-row-remove" data-action="remove-pending-file" data-index="${index}" type="button" style="flex-shrink:0;width:22px;height:22px;border:0;background:transparent;color:var(--muted);cursor:pointer;display:grid;place-items:center;border-radius:6px;font-size:15px;line-height:1;transition:all .15s;" aria-label="移除">×</button>
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
              ${renderModalCustomSelect({
                id: "upload-conflict-mode",
                value: conflictMode,
                actionChange: "set-upload-conflict-mode",
                className: "conflict-cselect",
                options: [
                  { value: "rename", label: "自动重命名" },
                  { value: "overwrite", label: "覆盖已有" },
                  { value: "skip", label: "跳过" },
                ],
              })}
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

  return {
    login: renderLoginModal,
    folder: renderFolderModal,
    rename: renderRenameModal,
    "unlock-path": renderUnlockPathModal,
    "upload-confirm": renderUploadConfirmModal,
  };
}
