import { escapeHtml } from './utils.js';

const card = document.getElementById('shareCard');
const params = new URLSearchParams(window.location.search);
const token = params.get('token') || '';

function renderStatus(message, tone = 'loading') {
  card.className = `share-card share-card-${tone}`;
  card.innerHTML = `
    <div class="share-status share-status-${tone}">
      <span class="share-status-icon" aria-hidden="true">${tone === 'error' ? '!' : ''}</span>
      <strong>${escapeHtml(message)}</strong>
    </div>
  `;
}

function formatDate(ts) {
  return ts ? new Date(ts).toLocaleString('zh-CN', { hour12: false }) : '长期有效';
}

function shareUnavailableMessage(data = {}) {
  if (data.code !== 'SHARE_EXPIRED') return data.message || '分享链接不可用。';
  if (data.deleted) return '分享链接已过期并被清理。';
  const autoDelete = data.autoDeleteAt ? `，预计 ${formatDate(data.autoDeleteAt)} 自动清理` : '';
  return `分享链接已过期${autoDelete}。`;
}

function fileKindLabel(name = '') {
  const ext = String(name).split('.').pop().toLowerCase();
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'avif'].includes(ext)) return '图片';
  if (['mp4', 'webm', 'mov', 'mkv'].includes(ext)) return '视频';
  if (['mp3', 'wav', 'ogg', 'flac', 'm4a'].includes(ext)) return '音频';
  if (ext === 'pdf') return 'PDF';
  if (['txt', 'md', 'json', 'js', 'css', 'html', 'xml', 'csv', 'log', 'yml', 'yaml'].includes(ext)) return '文本';
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return '压缩包';
  return ext ? ext.toUpperCase() : '文件';
}

function previewMarkup(item) {
  if (!item.allowPreview) return '<div class="share-preview-empty">分享者关闭了在线预览。</div>';
  const src = `/api/share/${encodeURIComponent(item.token)}/preview`;
  const name = item.name || '';
  const ext = name.split('.').pop().toLowerCase();
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'avif'].includes(ext)) {
    return `<img src="${escapeHtml(src)}" alt="${escapeHtml(name)}">`;
  }
  if (['mp4', 'webm', 'mov', 'mkv'].includes(ext)) {
    return `<video src="${escapeHtml(src)}" controls playsinline></video>`;
  }
  if (['mp3', 'wav', 'ogg', 'flac', 'm4a'].includes(ext)) {
    return `<audio src="${escapeHtml(src)}" controls></audio>`;
  }
  if (ext === 'pdf') {
    return `<iframe src="${escapeHtml(src)}" title="${escapeHtml(name)}"></iframe>`;
  }
  if (['txt', 'md', 'json', 'js', 'css', 'html', 'xml', 'csv', 'log', 'yml', 'yaml'].includes(ext)) {
    return `<iframe src="${escapeHtml(src)}" title="${escapeHtml(name)}"></iframe>`;
  }
  return '<div class="share-preview-empty">当前文件类型暂不支持在线预览，可直接下载。</div>';
}

function renderItem(item) {
  const downloadUrl = `/api/share/${encodeURIComponent(item.token)}/download`;
  const hasLimit = Number(item.maxDownloads || 0) > 0;
  const downloadText = hasLimit
    ? `${item.downloadCount || 0} / ${item.maxDownloads}`
    : `${item.downloadCount || 0} / 不限`;
  card.className = 'share-card share-card-ready';
  card.innerHTML = `
    <div class="share-main">
      <div class="share-file-icon" aria-hidden="true">${escapeHtml(fileKindLabel(item.name).slice(0, 3))}</div>
      <div class="share-title">
        <div class="share-kicker">O-Drive 分享文件</div>
        <h1>${escapeHtml(item.name)}</h1>
        <div class="share-path" title="${escapeHtml(item.path || '')}">${escapeHtml(item.path || '')}</div>
      </div>
    </div>
    <div class="share-meta" aria-label="分享信息">
      <div class="share-meta-item"><span>大小</span><strong>${escapeHtml(item.sizeFormatted || '0 B')}</strong></div>
      <div class="share-meta-item"><span>过期</span><strong>${escapeHtml(formatDate(item.expiresAt))}</strong></div>
      <div class="share-meta-item"><span>下载</span><strong>${escapeHtml(downloadText)}</strong></div>
    </div>
    <div class="share-actions">
      ${item.allowDownload ? `<a class="btn btn-primary" href="${escapeHtml(downloadUrl)}">下载文件</a>` : ''}
      <a class="btn" href="/">返回 O-Drive</a>
    </div>
    <div class="share-preview">${previewMarkup(item)}</div>
  `;
}

async function init() {
  if (!token) {
    renderStatus('分享链接缺少 token。', 'error');
    return;
  }
  renderStatus('正在加载分享...', 'loading');
  try {
    const res = await fetch(`/api/share/${encodeURIComponent(token)}/info`);
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.item) {
      renderStatus(shareUnavailableMessage(data || {}), 'error');
      return;
    }
    renderItem(data.item);
  } catch (_) {
    renderStatus('分享链接加载失败。', 'error');
    return;
  }
}

init();
