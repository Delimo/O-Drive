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

const imageExts = ['jpg', 'jpeg', 'png', 'webp', 'gif'];
const videoExts = ['mp4', 'webm'];
const audioExts = ['mp3', 'wav', 'ogg', 'flac'];
const textExts = ['txt', 'md', 'js', 'css', 'html', 'json', 'py', 'sh', 'sql', 'php', 'yml', 'yaml', 'xml', 'csv', 'log'];
const archiveExts = ['zip', 'rar', '7z', 'tar', 'gz'];

function iconSvg(body, className = '') {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" class="${className}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}

function fileIcon(kind) {
  switch (kind) {
    case 'folder':
      return iconSvg('<path d="M3.5 7.5a2 2 0 0 1 2-2h4.4l2 2.2H19a2 2 0 0 1 2 2v6.8a2 2 0 0 1-2 2H5.5a2 2 0 0 1-2-2z"/><path d="M3.5 10.5h17"/>', 'file-icon-svg text-amber-500');
    case 'image':
      return iconSvg('<rect x="4.5" y="5" width="15" height="14" rx="2"/><circle cx="9" cy="9" r="1.5"/><path d="M5.5 17l4.2-4.2 2.8 2.8 2.1-2.1 3.9 3.5"/>', 'file-icon-svg text-sky-500');
    case 'video':
      return iconSvg('<rect x="4.5" y="6" width="11" height="12" rx="2"/><path d="M16 10.5 20 8v8l-4-2.5z"/>', 'file-icon-svg text-violet-500');
    case 'audio':
      return iconSvg('<path d="M10 7v10"/><path d="M10 8.5 14 7v10l-4-1.5z"/><path d="M6 10.5c1.7 0 2.5 1.2 2.5 1.5S7.7 13.5 6 13.5"/><path d="M17 9c1.7 0 2.5 1.2 2.5 1.5S18.7 12 17 12"/>', 'file-icon-svg text-emerald-500');
    case 'pdf':
      return iconSvg('<path d="M7 3.5h7l5 5V20.5H7z"/><path d="M14 3.5V9h5"/><path d="M9 12h6"/><path d="M9 15h6"/>', 'file-icon-svg text-rose-500');
    case 'archive':
      return iconSvg('<path d="M5 8h14l-1 11H6z"/><path d="M7 8l.6-3h8.8l.6 3"/><path d="M11.5 10.5h1v5h-1z"/><path d="M10.5 13h3"/>', 'file-icon-svg text-amber-600');
    case 'text':
      return iconSvg('<path d="M7 3.5h7l5 5V20.5H7z"/><path d="M14 3.5V9h5"/><path d="M9 11.5h6"/><path d="M9 14.5h6"/><path d="M9 17.5h4"/>', 'file-icon-svg text-slate-500');
    case 'exe':
      return iconSvg('<rect x="4.5" y="5.5" width="15" height="13" rx="2"/><path d="M7.5 10.2 10 12l-2.5 1.8"/><path d="M12.2 14h4.3"/>', 'file-icon-svg text-sky-600');
    default:
      return iconSvg('<path d="M7 3.5h7l5 5V20.5H7z"/><path d="M14 3.5V9h5"/><path d="M9 12h6"/><path d="M9 15h6"/>', 'file-icon-svg text-slate-400');
  }
}

export const Utils = {
  getParentPath(p) {
    const parts = p.split('/').filter(Boolean);
    parts.pop();
    return '/' + parts.join('/') + (parts.length ? '/' : '');
  },
  formatDate(ts) {
    return ts ? new Date(ts).toLocaleString('zh-CN', { hour12: false }) : '-';
  },
  getExtension(name) {
    return String(name || '').split('.').pop().toLowerCase();
  },
  isImageFile(name) {
    return imageExts.includes(this.getExtension(name));
  },
  getFileKind(name) {
    const ext = this.getExtension(name);
    if (imageExts.includes(ext)) return 'image';
    if (videoExts.includes(ext)) return 'video';
    if (audioExts.includes(ext)) return 'audio';
    if (ext === 'pdf') return 'pdf';
    if (textExts.includes(ext)) return 'text';
    if (archiveExts.includes(ext)) return 'archive';
    if (ext === 'exe' || ext === 'msi' || ext === 'app' || ext === 'deb' || ext === 'dmg') return 'exe';
    return 'file';
  },
  getFileIcon(name) {
    return fileIcon(this.getFileKind(name));
  },
  getFolderIcon() {
    return fileIcon('folder');
  },
  getParentIcon() {
    return fileIcon('folder');
  },
  getBrandIcon() {
    return iconSvg('<rect x="4.5" y="4.5" width="15" height="15" rx="4"/><path d="M8 11h8"/><path d="M8 15h5"/><circle cx="16.3" cy="15" r="1"/>', 'brand-icon text-primary');
  },
  getAdminIcon() {
    return iconSvg('<circle cx="12" cy="12" r="3.5"/><path d="M12 5.5v1.2"/><path d="M12 17.3v1.2"/><path d="M5.5 12h1.2"/><path d="M17.3 12h1.2"/><path d="M7.2 7.2l.8.8"/><path d="M16 16l.8.8"/><path d="M16 7.2l-.8.8"/><path d="M7.2 16l.8-.8"/>', 'brand-icon text-primary');
  },
  isPreviewable(name) {
    return ['image', 'video', 'audio', 'pdf', 'text'].includes(this.getFileKind(name));
  },
};
