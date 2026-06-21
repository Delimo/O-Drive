import { state } from './state.js';
import { api } from './api.js';
import { UI, Message } from './ui.js';
import { PreviewActions } from './preview-actions.js';
import { describeItem } from './filters.js';

export function createFileShareActions() {
  return {
    openDetails(item) {
      if (!item) return;
      const data = typeof item === 'string'
        ? [...state.fileData.folders, ...state.fileData.files].find(i => i.fullKey === item)
        : item;
      if (!data) return;
      state.detailsItem = data;
      UI.renderDetailsPanel(describeItem(data));
    },

    copyDirectLink(path) {
      if (state.userRole !== 'admin' || !path) return;
      const link = new URL(api.previewUrl(path), window.location.origin).href;
      navigator.clipboard?.writeText(link)
        .then(() => Message.success('已复制直链'))
        .catch(() => Message.error('复制失败'));
    },

    async createShare(path) {
      if (state.userRole !== 'admin' || !path) return;
      document.getElementById('sharePathInput').value = path;
      document.getElementById('sharePathLabel').textContent = path;
      document.getElementById('shareDaysInput').value = '7';
      document.getElementById('shareMaxDownloadsInput').value = '0';
      document.getElementById('sharePasswordInput').value = '';
      document.getElementById('shareAllowPreviewInput').checked = true;
      document.getElementById('shareAllowDownloadInput').checked = true;
      document.getElementById('shareCreateError').textContent = '';
      UI.showModal('shareModal');
      setTimeout(() => document.getElementById('shareDaysInput')?.focus(), 0);
    },

    async submitShare() {
      if (state.userRole !== 'admin') return;
      const path = document.getElementById('sharePathInput')?.value || '';
      const days = Number(document.getElementById('shareDaysInput')?.value || 0);
      const maxDownloads = Number(document.getElementById('shareMaxDownloadsInput')?.value || 0);
      const password = (document.getElementById('sharePasswordInput')?.value || '').trim();
      const allowPreview = Boolean(document.getElementById('shareAllowPreviewInput')?.checked);
      const allowDownload = Boolean(document.getElementById('shareAllowDownloadInput')?.checked);
      const error = document.getElementById('shareCreateError');
      const showError = message => {
        if (error) error.textContent = message;
        else Message.error(message);
      };
      if (!path) return showError('缺少分享文件路径');
      if (!Number.isFinite(days) || days < 0 || days > 3650) return showError('有效期需要在 0 到 3650 天之间');
      if (!Number.isFinite(maxDownloads) || maxDownloads < 0 || maxDownloads > 1000000) return showError('下载次数需要在 0 到 1000000 之间');
      if (password && password.length < 4) return showError('分享密码至少 4 位');
      if (!allowPreview && !allowDownload) return showError('至少需要允许预览或下载其中一项');
      if (error) error.textContent = '';
      const { res, data } = await api.createShare({
        path,
        expiresInDays: days,
        maxDownloads,
        allowPreview,
        allowDownload,
        password,
      });
      if (!res.ok || !data?.item?.token) {
        showError(data?.message || '创建分享失败');
        return;
      }
      const link = new URL(`/share.html?token=${encodeURIComponent(data.item.token)}`, window.location.origin).href;
      UI.closeModal('shareModal');
      try {
        await navigator.clipboard.writeText(link);
        Message.success('分享链接已创建并复制');
      } catch (_) {
        Message.success(`分享链接已创建：${link}`);
      }
    },

    downloadFile(p, force = false) {
      const item = [...(state.fileData.folders || []), ...(state.fileData.files || [])].find(i => i.path === p || i.fullKey === p);
      if (!force && item?.protected && state.userRole !== 'admin') {
        return PreviewActions.handlePasswordRequired({ path: item.fullKey || p }, () => this.downloadFile(p, true));
      }
      window.open(api.download(p), '_blank', 'noopener');
    },
  };
}
