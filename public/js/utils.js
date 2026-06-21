import { getExtension, getFileKind, isImageFile, isPreviewable } from './file-types.js';

export const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));

export const sanitizeHtml = (html) => {
  const allowedTags = new Set([
    'A', 'BLOCKQUOTE', 'BR', 'CODE', 'EM', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
    'HR', 'LI', 'OL', 'P', 'PRE', 'S', 'STRONG', 'TABLE', 'TBODY', 'TD', 'TH',
    'THEAD', 'TR', 'UL',
  ]);
  const allowedAttrs = new Set(['href', 'title']);
  const template = document.createElement('template');
  template.innerHTML = html;
  template.content.querySelectorAll('*').forEach(node => {
    if (!allowedTags.has(node.tagName)) {
      node.replaceWith(document.createTextNode(node.textContent || ''));
      return;
    }
    [...node.attributes].forEach(attr => {
      const name = attr.name.toLowerCase();
      const value = attr.value.trim();
      if (!allowedAttrs.has(name)) {
        node.removeAttribute(attr.name);
        return;
      }
      if (name === 'href' && !/^(https?:|mailto:|#|\/)/i.test(value)) node.removeAttribute(attr.name);
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
  getExtension(name) {
    return getExtension(name);
  },
  isImageFile(name) {
    return isImageFile(name);
  },
  getFileKind(name) {
    return getFileKind(name);
  },
  getFileIcon(name) {
    const ext = this.getExtension(name);
    const map = {
      jpg: '🖼️',
      jpeg: '🖼️',
      png: '🖼️',
      webp: '🖼️',
      gif: '🖼️',
      mp4: '🎞️',
      webm: '🎞️',
      mp3: '🎵',
      wav: '🎵',
      ogg: '🎵',
      flac: '🎵',
      pdf: '📕',
      zip: '🗃️',
      rar: '🗃️',
      '7z': '🗃️',
      tar: '🗃️',
      gz: '🗃️',
      exe: '🖥️',
      msi: '🖥️',
      app: '🖥️',
      deb: '🖥️',
      dmg: '🖥️',
      txt: '📝',
      md: '📝',
      js: '📝',
      css: '📝',
      html: '📝',
      json: '📝',
      py: '📝',
      sh: '📝',
      sql: '📝',
      php: '📝',
      yml: '📝',
      yaml: '📝',
      xml: '📝',
      csv: '📝',
      log: '📝',
    };
    return map[ext] || '📄';
  },
  getFolderIcon() {
    return '📁';
  },
  getParentIcon() {
    return '📁';
  },
  getBrandIcon() {
    return '☁️';
  },
  getAdminIcon() {
    return '⚙️';
  },
  isPreviewable(name) {
    return isPreviewable(name);
  },
};
