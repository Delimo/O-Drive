import { fileIconSvg, iconSvg } from './icons.js';

export const escapeHtml = value =>
  String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));

export const sanitizeHtml = html => {
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
    if (['exe', 'msi', 'app', 'deb', 'dmg'].includes(ext)) return 'exe';
    return 'file';
  },
  getFileIcon(name) {
    return fileIconSvg(this.getFileKind(name));
  },
  getFolderIcon() {
    return fileIconSvg('folder');
  },
  getParentIcon() {
    return fileIconSvg('parent', 'file-kind-muted');
  },
  getBrandIcon() {
    return iconSvg('cloud', 'brand-icon-svg');
  },
  getAdminIcon() {
    return iconSvg('settings', 'brand-icon-svg');
  },
  isPreviewable(name) {
    return ['image', 'video', 'audio', 'pdf', 'text'].includes(this.getFileKind(name));
  },
};
