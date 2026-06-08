export const WEBHOOK_EVENT_OPTIONS = [
  ['file.uploaded', '上传'],
  ['file.deleted', '删除'],
  ['file.purged', '彻底删除'],
  ['file.moved', '移动'],
  ['file.copied', '复制'],
  ['file.renamed', '重命名'],
  ['folder.created', '新建文件夹'],
  ['download.burst', '下载异常提醒'],
  ['login.burst', '登录异常'],
  ['share.expired', '分享链接到期'],
];

export const WEBHOOK_EVENT_KEYS = WEBHOOK_EVENT_OPTIONS.map(([key]) => key);

export function normalizeWebhookItems(data = {}) {
  const source = Array.isArray(data.items) ? data.items : [];
  return source.map((item, index) => ({
    id: item.id || `${Date.now()}-${index}`,
    name: item.name || '',
    msgtype: ['json', 'text', 'markdown'].includes(item.msgtype)
      ? item.msgtype
      : 'json',
    url: item.url || '',
    method: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(String(item.method || '').toUpperCase())
      ? String(item.method).toUpperCase()
      : 'POST',
    contentType: item.contentType || 'application/json',
    headers: item.headers && typeof item.headers === 'object' && !Array.isArray(item.headers) ? item.headers : {},
    body: item.body || '',
    events: Array.isArray(item.events)
      ? [...new Set(item.events.map(event => String(event || '').trim()).filter(event => WEBHOOK_EVENT_KEYS.includes(event)))]
      : [],
    enabled: item.enabled !== false,
  })).filter(item => item.url);
}

export function selectedWebhookEvents() {
  return [...document.querySelectorAll('input[name="webhookEvents"]:checked')]
    .map(input => input.value)
    .filter(value => WEBHOOK_EVENT_KEYS.includes(value));
}

export function setWebhookEvents(events = []) {
  const selected = Array.isArray(events) && events.length ? new Set(events) : new Set(WEBHOOK_EVENT_KEYS);
  document.querySelectorAll('input[name="webhookEvents"]').forEach(input => {
    input.checked = selected.has(input.value);
  });
}

export function webhookEventsLabel(events = []) {
  if (!Array.isArray(events) || events.length === 0 || events.length === WEBHOOK_EVENT_KEYS.length) return '全部事件';
  return events.map(event => WEBHOOK_EVENT_OPTIONS.find(([key]) => key === event)?.[1] || event).join('、');
}

export function headersToText(headers = {}) {
  return Object.keys(headers).length ? JSON.stringify(headers, null, 2) : '';
}

export function parseHeadersText(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return {};
  const parsed = JSON.parse(trimmed);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('headers 必须是 JSON 对象');
  return parsed;
}
