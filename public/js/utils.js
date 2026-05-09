export const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));

export const sanitizeHtml = (html) => {
  const template = document.createElement('template');
  template.innerHTML = html;
  template.content.querySelectorAll('script,style,iframe,object,embed,link,meta').forEach(node => node.remove());
  template.content.querySelectorAll('*').forEach(node => {
    [...node.attributes].forEach(attr => {
      if (/^on/i.test(attr.name) || /javascript:/i.test(attr.value)) node.removeAttribute(attr.name);
    });
    if (node.tagName === 'A') {
      node.setAttribute('rel', 'noreferrer noopener');
      node.setAttribute('target', '_blank');
    }
  });
  return template.innerHTML;
};

export const Utils = {
  getParentPath(p) {
    const parts = p.split('/').filter(Boolean);
    parts.pop();
    return '/' + parts.join('/') + (parts.length ? '/' : '');
  },
  formatDate(ts) {
    return ts ? new Date(ts).toLocaleString('zh-CN', { hour12: false }) : '-';
  },
  getFileIcon(name) {
    const ext = name.split('.').pop().toLowerCase();
    const map = {
      jpg: '📷', jpeg: '📷', png: '📷', webp: '📷', gif: '📷',
      mp4: '🎞️', webm: '🎞️', mp3: '🎵', wav: '🎵',
      pdf: '📄', zip: '🗜️', rar: '🗜️', '7z': '🗜️',
    };
    return map[ext] || '📄';
  },
  isPreviewable(name) {
    return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4', 'webm', 'mp3', 'wav', 'txt', 'pdf', 'md', 'js', 'css', 'html', 'json', 'py', 'sh', 'sql', 'php', 'yml', 'yaml'].includes(name.split('.').pop().toLowerCase());
  },
};
