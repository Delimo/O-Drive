export function describeLogAction(action = '') {
  const normalized = String(action || '').toUpperCase();
  const labels = {
    UPLOAD: '上传文件',
    UPLOAD_START: '上传开始',
    UPLOAD_ABORT: '上传取消',
    DELETE: '删除',
    RENAME: '重命名',
    MOVE: '移动',
    COPY: '复制',
    MKDIR: '新建文件夹',
    PASTE: '粘贴',
    PROTECT: '设置密码',
    UNPROTECT: '删除密码',
    HIDE: '隐藏路径',
    UNHIDE: '取消隐藏',
    MAINTENANCE: '维护操作',
    QUOTA: '存储配额',
    WEBHOOKS: 'Webhook 配置',
    WEBHOOK_TEST: 'Webhook 测试',
    SHARE_CREATE: '创建分享',
    SHARE_DELETE: '删除分享',
    SHARE_CLEANUP: '清理分享',
    TRASH: '回收站',
    RESTORE: '恢复文件',
    PURGE: '彻底删除',
    TRASH_CLEAR: '清空回收站',
    TRASH_CLEANUP: '清理回收站',
    TRASH_RETENTION: '回收站保留期',
    SAVE_TEXT: '保存文本',
    UPLOAD_CONFLICT: '上传冲突',
  };
  return labels[normalized] || normalized.replace(/_/g, ' ').toLowerCase().replace(/(^|\s)\S/g, s => s.toUpperCase()) || '未知操作';
}

export function logActionClass(action = '') {
  const normalized = String(action || '').toUpperCase();
  if (normalized.includes('DELETE') || normalized.includes('ABORT') || normalized.includes('PURGE') || normalized.includes('CLEAR')) return 'is-delete';
  if (normalized.includes('UPLOAD') || normalized.includes('CREATE') || normalized.includes('MKDIR')) return 'is-upload';
  return 'is-default';
}
