export function adminTime(value) {
  const num = Number(value || 0);
  return num ? new Date(num).toLocaleString('zh-CN', { hour12: false }) : '-';
}

export function statusLabel(status = '') {
  const map = {
    completed: '已完成',
    partial: '部分完成',
    failed: '失败',
    running: '运行中',
    queued: '排队中',
  };
  return map[status] || status || '-';
}

export function statusClass(status = '') {
  if (['completed', 'success', 'ok'].includes(status)) return 'is-ok';
  if (['failed', 'error', 'partial'].includes(status)) return 'is-bad';
  if (['running', 'queued'].includes(status)) return 'is-running';
  return '';
}

export function formatBytesLocal(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 2 : 0) + ' ' + units[i];
}

export function formatGbInput(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value < 0) return '10';
  const gb = value / (1024 ** 3);
  return Number(gb.toFixed(2)).toString();
}

export function parseCapacityLocal(value) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) return { ok: false, bytes: 0 };
    return { ok: true, bytes: Math.floor(value) };
  }
  const raw = String(value ?? '').trim();
  if (!raw) return { ok: true, bytes: 0 };
  const match = raw.match(/^(\d+(?:\.\d+)?)\s*([kmgtp]?i?b?|b)?$/i);
  if (!match) return { ok: false, bytes: 0 };
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount < 0) return { ok: false, bytes: 0 };
  const unit = String(match[2] || 'b').toLowerCase();
  const powers = {
    b: 0,
    k: 1,
    kb: 1,
    kib: 1,
    m: 2,
    mb: 2,
    mib: 2,
    g: 3,
    gb: 3,
    gib: 3,
    t: 4,
    tb: 4,
    tib: 4,
    p: 5,
    pb: 5,
    pib: 5,
  };
  return { ok: true, bytes: Math.floor(amount * (1024 ** (powers[unit] ?? 0))) };
}
