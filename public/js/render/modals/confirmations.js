export function createConfirmationModalRenderers({
  escapeHtml,
  renderOptionalFormFeedback,
  renderModalCustomSelect,
}) {
  function renderConfirmClearTrashModal(modal) {
    return `
      <div class="modal-wrap" data-action="close-modal-backdrop">
        <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="confirm-clear-title" data-stop-close="true">
          <h3 id="confirm-clear-title" class="modal-title">清空回收站</h3>
          <p class="modal-copy">你确定要清空回收站中的所有项目吗？此操作将永久删除所有回收站中的文件和文件夹。</p>
          <div class="attention-item" data-level="warning" style="margin:16px 0;">
            <h3 class="attention-title">此操作不可撤销</h3>
            <div class="attention-copy">清空后，所有回收站中的项目将被永久删除，无法恢复。请确认你不再需要这些文件。</div>
          </div>
          ${renderOptionalFormFeedback(modal.error, modal.loading ? "正在清空回收站，请稍候..." : "", "margin:12px 0;")}
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

  function renderTrashRestoreConfirmModal(modal) {
    const preview = modal.preview || {};
    const items = preview.items || [];
    const conflicts = items.filter((item) => item.conflict);
    const conflictMode = modal.conflictMode || "rename";
    const itemRows = items.slice(0, 24).map((item) => `
      <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--line);font-size:13px;">
        <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(item.originalKey || item.name || "")}</span>
        <span class="badge">${item.kind === "folder" ? "文件夹" : "文件"}</span>
        ${item.conflict ? '<span class="badge badge-warning">冲突</span>' : '<span class="badge badge-success">可恢复</span>'}
      </div>
    `).join("");
    const hasMore = items.length > 24;
    return `
      <div class="modal-wrap" data-action="close-modal-backdrop">
        <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="trash-restore-title" data-stop-close="true" style="max-width:560px;">
          <h3 id="trash-restore-title" class="modal-title">恢复回收站项目</h3>
          <p class="modal-copy">恢复前已检测目标路径，选择遇到同名项目时的处理方式。</p>

          <div class="hero-strip-compact" style="margin:12px 0;">
            <div class="mini-stat-compact">
              <div class="mini-stat-label">待恢复</div>
              <div class="mini-stat-value">${preview.total ?? items.length}</div>
              <div class="mini-stat-meta">回收站记录</div>
            </div>
            <div class="mini-stat-compact">
              <div class="mini-stat-label">冲突</div>
              <div class="mini-stat-value">${preview.conflictCount ?? conflicts.length}</div>
              <div class="mini-stat-meta">目标路径已存在</div>
            </div>
          </div>

          ${conflicts.length ? `
            <div class="attention-item" data-level="warning" style="margin:12px 0;">
              <h3 class="attention-title">存在恢复冲突</h3>
              <div class="attention-copy">跳过会保留回收站记录，覆盖会先清理目标路径，自动重命名会恢复到新的可用名称。</div>
            </div>
          ` : ""}

          <div style="display:flex;align-items:center;gap:10px;margin:12px 0;">
            <label style="flex-shrink:0;font-size:13px;color:var(--muted);">冲突策略</label>
            ${renderModalCustomSelect({
              id: "trash-restore-conflict-mode",
              value: conflictMode,
              actionChange: "set-trash-restore-conflict-mode",
              className: "conflict-cselect",
              options: [
                { value: "rename", label: "自动重命名" },
                { value: "skip", label: "跳过冲突" },
                { value: "overwrite", label: "覆盖已有" },
              ],
            })}
          </div>

          ${items.length ? `
            <div style="max-height:220px;overflow-y:auto;border:1px solid var(--line);border-radius:8px;padding:6px 12px;margin:8px 0;">
              ${itemRows}
              ${hasMore ? `<div style="text-align:center;padding:8px;font-size:12px;color:var(--muted);">... 还有 ${items.length - 24} 项</div>` : ""}
            </div>
          ` : ""}

          ${renderOptionalFormFeedback(modal.error, modal.loading ? "正在恢复，请勿刷新页面..." : "", "margin:12px 0;")}

          <div class="btn-row" style="margin-top:12px;justify-content:flex-end;">
            <button class="btn btn-primary" type="button" data-action="execute-trash-restore" ${modal.loading ? "disabled" : ""}>
              ${modal.loading ? "恢复中..." : "确认恢复"}
            </button>
            <button class="btn" type="button" data-action="close-modal" ${modal.loading ? "disabled" : ""}>取消</button>
          </div>
        </div>
      </div>
    `;
  }

  function renderOperationEstimateModal(modal) {
    const estimate = modal.estimate;
    const operation = modal.operation || "delete";
    const isDelete = operation === "delete";
    const opLabel = isDelete ? "删除" : operation === "move" ? "移动" : "复制";
    const items = estimate?.items || [];
    const allMissing =
      items.length > 0 && items.every((item) => item.exists === false);
    const blocked = isDelete && (Boolean(estimate?.truncated) || allMissing);
    const itemList = items.slice(0, 30).map((item) => `
      <div style="display:flex;align-items:center;gap:8px;padding:4px 0;font-size:13px;border-bottom:1px solid var(--line);">
        <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(item.path)}</span>
        <span class="toolbar-tag">${item.kind === "folder" ? "文件夹" : "文件"}</span>
        <span style="color:var(--muted);font-size:12px;">${item.objectCount} 对象</span>
      </div>
    `).join("");
    const hasMore = items.length > 30;

    return `
      <div class="modal-wrap" data-action="close-modal-backdrop">
        <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="estimate-title" data-stop-close="true" style="max-width:520px;">
          <h3 id="estimate-title" class="modal-title">确认${opLabel}</h3>
          <p class="modal-copy">以下是对所选项目的操作预估，请确认后继续。</p>

          <div class="hero-strip-compact" style="margin:12px 0;">
            <div class="mini-stat-compact">
              <div class="mini-stat-label">影响对象</div>
              <div class="mini-stat-value">${estimate?.totalObjects ?? 0}</div>
              <div class="mini-stat-meta">文件与文件夹总数</div>
            </div>
            <div class="mini-stat-compact">
              <div class="mini-stat-label">选中项目</div>
              <div class="mini-stat-value">${items.length}</div>
              <div class="mini-stat-meta">直接选中项</div>
            </div>
            <div class="mini-stat-compact">
              <div class="mini-stat-label">预估规模</div>
              <div class="mini-stat-value">${estimate?.large ? "较大" : "常规"}</div>
              <div class="mini-stat-meta">${estimate?.shouldBatch ? "建议分批" : "可一次执行"}</div>
            </div>
          </div>

          ${allMissing ? `
            <div class="attention-item" data-level="warning" style="margin:12px 0;">
              <h3 class="attention-title">所选项目不存在</h3>
              <div class="attention-copy">请刷新目录后重新选择。</div>
            </div>
          ` : ""}

          ${estimate?.truncated ? `
            <div class="attention-item" data-level="warning" style="margin:12px 0;">
              <h3 class="attention-title">目录规模超过同步删除上限</h3>
              <div class="attention-copy">请进入子目录分批处理。</div>
            </div>
          ` : ""}

          ${estimate?.shouldBatch ? `
            <div class="attention-item" data-level="warning" style="margin:12px 0;">
              <h3 class="attention-title">操作规模较大</h3>
              <div class="attention-copy">影响对象超过 ${estimate?.recommendedBatchSize || 1000} 个，系统建议分批执行。可继续执行，但可能耗时较长。</div>
            </div>
          ` : ""}

          ${items.length > 0 ? `
            <div style="max-height:200px;overflow-y:auto;border:1px solid var(--line);border-radius:8px;padding:8px 12px;margin:8px 0;">
              ${itemList}
              ${hasMore ? `<div style="text-align:center;padding:8px;font-size:12px;color:var(--muted);">... 还有 ${items.length - 30} 项</div>` : ""}
            </div>
          ` : ""}

          ${renderOptionalFormFeedback(modal.error, modal.loading ? "执行中，请勿刷新页面..." : "", "margin:12px 0;")}

          <div class="btn-row" style="margin-top:12px;">
            <button class="btn btn-danger" type="button"
              data-action="${isDelete ? "execute-batch-delete" : "execute-batch-paste"}"
              ${modal.loading || blocked ? "disabled" : ""}>
              <span>${modal.loading ? "执行中..." : `确认${opLabel}（${estimate?.totalObjects ?? 0} 项）`}</span>
            </button>
            <button class="btn" type="button" data-action="close-modal" ${modal.loading ? "disabled" : ""}>取消</button>
          </div>
        </div>
      </div>
    `;
  }

  return {
    "confirm-clear-trash": renderConfirmClearTrashModal,
    "trash-restore-confirm": renderTrashRestoreConfirmModal,
    "operation-estimate": renderOperationEstimateModal,
  };
}
