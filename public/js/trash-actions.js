import { state } from './state.js';
import { api } from './api.js';
import { UI, Message } from './ui.js';
import { confirmDanger, readableError } from './file-operation-utils.js';

export function createTrashActions() {
  return {
    async openTrash() {
      const f = state.trash.filters || {};
      const query = document.getElementById('trashFilterQuery');
      const kind = document.getElementById('trashFilterKind');
      const from = document.getElementById('trashFilterFrom');
      const to = document.getElementById('trashFilterTo');
      if (query) query.value = f.q || '';
      if (kind) kind.value = f.kind || 'all';
      if (from) from.value = f.from || '';
      if (to) to.value = f.to || '';
      await this.loadTrash();
      const retention = await api.trashRetention();
      const input = document.getElementById('trashRetentionDays');
      if (input && retention.res.ok) input.value = String(retention.data?.days || 0);
      UI.showModal('trashModal');
    },

    async loadTrash(page = state.trash.currentPage || 1) {
      const f = state.trash.filters || {};
      const filters = {
        q: f.q || '',
        kind: f.kind || 'all',
        from: f.from ? new Date(`${f.from}T00:00:00`).getTime() : '',
        to: f.to ? new Date(`${f.to}T23:59:59.999`).getTime() : '',
      };
      const { res, data } = await api.trashList(page, 20, filters);
      if (!res.ok) return;
      state.trash.items = data.items || [];
      state.trash.currentPage = data.currentPage || page;
      state.trash.totalPages = data.totalPages || 1;
      state.trash.total = data.total || state.trash.items.length;
      UI.renderTrashList();
    },

    async applyTrashFilters() {
      state.trash.filters = {
        q: document.getElementById('trashFilterQuery')?.value.trim() || '',
        kind: document.getElementById('trashFilterKind')?.value || 'all',
        from: document.getElementById('trashFilterFrom')?.value || '',
        to: document.getElementById('trashFilterTo')?.value || '',
      };
      await this.loadTrash(1);
    },

    async resetTrashFilters() {
      state.trash.filters = { q: '', kind: 'all', from: '', to: '' };
      ['trashFilterQuery', 'trashFilterFrom', 'trashFilterTo'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
      });
      const kind = document.getElementById('trashFilterKind');
      if (kind) kind.value = 'all';
      await this.loadTrash(1);
    },

    async trashPage(delta) {
      const next = Math.min(Math.max(1, (state.trash.currentPage || 1) + delta), state.trash.totalPages || 1);
      if (next === state.trash.currentPage) return;
      await this.loadTrash(next);
    },

    async restoreTrash(id) {
      const { res, data } = await api.restoreTrash(id);
      if (res.ok) {
        Message.success('已恢复');
        await this.loadTrash();
        this.loadFiles();
      } else {
        Message.error(readableError(res, data, '恢复失败'));
      }
    },

    async purgeTrash(id) {
      const item = (state.trash.items || []).find(row => row.id === id);
      const confirmed = await confirmDanger(
        '确认彻底删除这条回收站记录？',
        item?.original_key ? [item.original_key] : [],
        '彻底删除后无法恢复。',
        { danger: true }
      );
      if (!confirmed) return;
      const { res, data } = await api.deleteTrash(id);
      if (res.ok) {
        Message.success('已彻底删除');
        await this.loadTrash();
        this.loadFiles();
      } else {
        Message.error(readableError(res, data, '删除失败'));
      }
    },

    async clearTrash() {
      const paths = (state.trash.items || []).map(item => item.original_key);
      const confirmed = await confirmDanger(
        `确认清空回收站当前可见的 ${paths.length} 项？`,
        paths,
        '清空后无法恢复。分页之外的记录也会被一并清理。',
        { danger: true }
      );
      if (!confirmed) return;
      const { res, data } = await api.clearTrash();
      if (res.ok) {
        Message.success(`已清空 ${data?.deleted || 0} 项`);
        await this.loadTrash(1);
        this.loadFiles();
      } else {
        Message.error(readableError(res, data, '清空失败'));
      }
    },

    async cleanupTrash() {
      const { res, data } = await api.cleanupTrash();
      if (res.ok) {
        Message.success(`已清理 ${data?.deleted || 0} 项`);
        await this.loadTrash(1);
        this.loadFiles();
      } else {
        Message.error(readableError(res, data, '清理失败'));
      }
    },

    async saveTrashRetention() {
      const input = document.getElementById('trashRetentionDays');
      const days = Math.max(0, Number(input?.value || 0));
      const { res } = await api.setTrashRetention(days);
      if (res.ok) Message.success(days ? `已设置保留 ${days} 天` : '已关闭自动清理');
      else Message.error('保存清理策略失败');
    },
  };
}
