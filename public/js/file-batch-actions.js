import { state } from './state.js';
import { api } from './api.js';
import { UI, Message } from './ui.js';
import { getSelectableKeys } from './file-view-model.js';
import {
  confirmDanger,
  operationEstimate,
  operationEstimateText,
  readableError,
  shouldUseTask,
  startAndWatchTask,
} from './file-operation-utils.js';

export function createFileBatchActions() {
  return {
    toggleSelect(key, el, e) {
      e.stopPropagation();
      const selected = !state.selectedPaths.includes(key);
      state.selectedPaths = selected ? [...state.selectedPaths, key] : state.selectedPaths.filter(p => p !== key);
      UI.setItemSelected(key, selected);
      UI.updateBatchUI();
    },

    toggleSelectAll() {
      const allKeys = state.visibleKeys || getSelectableKeys(state.fileData);
      state.selectedPaths = state.selectedPaths.length === allKeys.length ? [] : allKeys;
      UI.updateFileList();
      UI.updateBatchUI();
    },

    setClipboard(action) {
      if (state.selectedPaths.length === 0) return;
      state.clipboard = { action, paths: [...state.selectedPaths] };
      state.selectedPaths = [];
      UI.updateBatchUI();
      UI.updateFileList();
      Message.success(`已加入${action === 'move' ? '移动' : '复制'}列表`);
    },

    clearClipboard() {
      if (!state.clipboard) return;
      state.clipboard = null;
      UI.updateBatchUI();
      this.loadFiles();
      Message.show('操作已取消');
    },

    async executePaste() {
      if (!state.clipboard) return;
      const estimateData = await operationEstimate(state.clipboard.paths);
      const estimate = estimateData ? await operationEstimateText(state.clipboard.paths) : '';
      const pasteConfirmed = estimate ? await confirmDanger(
        `确认${state.clipboard.action === 'move' ? '移动' : '复制'} ${state.clipboard.paths.length} 项到当前目录？`,
        state.clipboard.paths,
        estimate
      ) : true;
      if (!pasteConfirmed) return;
      if (shouldUseTask(estimateData)) {
        const payload = { ...state.clipboard, targetDir: state.currentPath };
        const ok = await startAndWatchTask('paste', payload, '后台任务已完成', async () => {
          state.clipboard = null;
          await this.loadFiles();
        });
        if (ok) state.clipboard = null;
        return;
      }
      Message.show('正在处理...');
      const { res, data } = await api.paste({ ...state.clipboard, targetDir: state.currentPath });
      if (res.ok && data?.success !== false) {
        Message.success('成功');
        state.clipboard = null;
        this.loadFiles();
      } else if (res.ok && data?.completed > 0) {
        Message.error(`已完成 ${data.completed} 项，失败 ${data.failed?.length || 0} 项`);
        state.clipboard = null;
        this.loadFiles();
      } else {
        Message.error(readableError(res, data, '粘贴失败'));
      }
    },

    async batchDelete() {
      const estimateData = await operationEstimate(state.selectedPaths);
      const estimate = estimateData ? await operationEstimateText(state.selectedPaths) : '';
      const confirmed = await confirmDanger(
        `确认将选中的 ${state.selectedPaths.length} 项移入回收站？`,
        state.selectedPaths,
        ['这些项目不会立即彻底删除，可以在回收站恢复。', estimate].filter(Boolean).join('\n'),
        { danger: true }
      );
      if (!confirmed) return;
      if (shouldUseTask(estimateData)) {
        const paths = [...state.selectedPaths];
        state.selectedPaths = [];
        UI.updateBatchUI();
        await startAndWatchTask('delete', { paths }, '后台删除任务已完成', async () => {
          await this.loadFiles();
        });
        return;
      }
      const { res, data } = await api.batchDelete(state.selectedPaths);
      if (res.ok && data?.success !== false) {
        Message.success('已移入回收站');
        this.loadFiles();
      } else if (res.ok && data?.completed > 0) {
        Message.error(`已处理 ${data.completed} 项，失败 ${data.failed?.length || 0} 项：${readableError(res, data)}`);
        this.loadFiles();
      } else {
        Message.error(readableError(res, data));
      }
    },

    clearSelection() {
      state.selectedPaths = [];
      UI.updateBatchUI();
      UI.updateFileList();
    },

    startRenameSelected() {
      const key = state.selectedPaths[0];
      const item = [...state.fileData.folders, ...state.fileData.files].find(i => i.fullKey === key);
      const nameEl = Array.from(document.querySelectorAll('.file-name')).find(el => el.closest('[data-key]')?.dataset?.key === key);
      if (item && nameEl) this.startInlineRename(item, nameEl);
    },

    async startInlineRename(item, el) {
      const oldName = item.name;
      const input = document.createElement('input');
      input.className = 'rename-input relative z-50 text-white';
      input.value = oldName;
      ['mousedown', 'mouseup', 'click', 'dblclick'].forEach(evt => input.addEventListener(evt, e => e.stopPropagation()));
      el.replaceWith(input);
      input.focus();

      const save = async () => {
        const newName = input.value.trim();
        if (newName && newName !== oldName) {
          if (!item.sizeFormatted) {
            const estimate = await operationEstimateText([item.fullKey]);
            const renameConfirmed = estimate ? await confirmDanger('确认重命名这个文件夹？', [item.fullKey], estimate) : true;
            if (!renameConfirmed) {
              this.loadFiles();
              return;
            }
          }
          const { res, data } = await api.renameFile(item.fullKey, newName);
          if (res.ok) Message.success('已完成');
          else Message.error(readableError(res, data, '重命名失败'));
        }
        this.loadFiles();
      };

      input.onblur = save;
      input.onkeypress = ev => {
        if (ev.key === 'Enter') input.blur();
      };
    },

    async submitMkdir() {
      const n = document.getElementById('folderNameInput').value.trim();
      if (!n) return;
      const { res, data } = await api.mkdir(state.currentPath, n);
      if (!res.ok) {
        Message.error(readableError(res, data, '创建失败'));
        return;
      }
      document.getElementById('folderNameInput').value = '';
      UI.closeModal('mkdirModal');
      this.loadFiles();
      Message.success('已创建');
    },
  };
}
