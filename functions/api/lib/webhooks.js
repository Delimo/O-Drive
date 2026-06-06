/**
 * @fileoverview Webhook notification system for file operations.
 * Sends HTTP POST notifications to configured webhook URLs when
 * significant events occur (file upload, delete, move, etc.).
 *
 * Configured from the admin Webhook settings stored in D1.
 */

/**
 * @typedef {object} WebhookPayload
 * @property {string} event - Event type (e.g. 'file.uploaded', 'file.deleted')
 * @property {string} timestamp - ISO 8601 timestamp
 * @property {object} data - Event-specific data
 */

const WEBHOOK_TIMEOUT_MS = 5000;
const MAX_RETRIES = 2;
const WEBHOOK_MSG_TYPES = ['json', 'text', 'markdown'];
const WEBHOOK_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const WEBHOOK_EVENTS = [
  'file.uploaded',
  'file.deleted',
  'file.purged',
  'file.moved',
  'file.copied',
  'file.renamed',
  'folder.created',
];

function endpointLabel(endpoint) {
  if (endpoint.name) return endpoint.name;
  return '通用';
}

function eventLabel(event) {
  const labels = {
    'file.uploaded': '文件上传',
    'file.deleted': '文件删除',
    'file.purged': '文件彻底删除',
    'file.moved': '文件移动',
    'file.copied': '文件复制',
    'file.renamed': '文件重命名',
    'folder.created': '文件夹创建',
    'webhook.test': '测试通知',
  };
  return labels[event] || event;
}

function textPayload(payload) {
  const data = payload.data || {};
  const lines = [
    `O-Drive ${eventLabel(payload.event)}`,
    `事件：${payload.event}`,
    `时间：${payload.timestamp}`,
  ];
  if (data.path) lines.push(`路径：${data.path}`);
  if (data.oldPath) lines.push(`原路径：${data.oldPath}`);
  if (data.newName) lines.push(`新名称：${data.newName}`);
  if (data.paths) lines.push(`对象：${Array.isArray(data.paths) ? data.paths.join(', ') : data.paths}`);
  if (data.targetDir) lines.push(`目标目录：${data.targetDir}`);
  if (data.message) lines.push(`说明：${data.message}`);
  return lines.join('\n');
}

function formatPayload(endpoint, payload) {
  if (endpoint.msgtype === 'text') {
    return {
      msgtype: 'text',
      text: { content: textPayload(payload) },
    };
  }
  if (endpoint.msgtype === 'markdown') {
    return {
      msgtype: 'markdown',
      markdown: { content: textPayload(payload) },
    };
  }
  return payload;
}

function parseHeaders(headers) {
  if (!headers) return {};
  if (typeof headers === 'string') {
    try {
      return parseHeaders(JSON.parse(headers));
    } catch {
      return {};
    }
  }
  if (typeof headers !== 'object' || Array.isArray(headers)) return {};
  return Object.fromEntries(
    Object.entries(headers)
      .map(([key, value]) => [String(key).trim(), String(value ?? '')])
      .filter(([key]) => key && !/[\r\n:]/.test(key))
  );
}

function readPayloadPath(payload, path) {
  return String(path || '')
    .split('.')
    .filter(Boolean)
    .reduce((value, part) => value && value[part], payload);
}

function renderTemplate(source, payload) {
  return String(source || '').replace(/\{\{\s*([\w.]+)\s*\}\}|\{\s*([\w.]+)\s*\}/g, (_, a, b) => {
    const value = readPayloadPath(payload, a || b);
    if (value == null) return '';
    return typeof value === 'object' ? JSON.stringify(value) : String(value);
  });
}

function formatBody(endpoint, payload) {
  if (endpoint.body) return renderTemplate(endpoint.body, payload);
  return JSON.stringify(formatPayload(endpoint, payload));
}

function buildRequestInit(endpoint, payload, controller) {
  const method = endpoint.method || 'POST';
  const headers = {
    ...(endpoint.contentType ? { 'Content-Type': endpoint.contentType } : {}),
    ...parseHeaders(endpoint.headers),
  };
  if (endpoint.username || endpoint.password) {
    const hasAuth = Object.keys(headers).some(key => key.toLowerCase() === 'authorization');
    if (!hasAuth) headers.Authorization = `Basic ${btoa(`${endpoint.username}:${endpoint.password}`)}`;
  }
  const init = { method, headers, signal: controller.signal };
  if (!['GET', 'HEAD'].includes(method)) init.body = formatBody(endpoint, payload);
  return init;
}

function normalizeEvents(events) {
  if (!Array.isArray(events)) return [];
  return [...new Set(events.map(event => String(event || '').trim()).filter(event => WEBHOOK_EVENTS.includes(event)))];
}

function endpointMatchesEvent(endpoint, event) {
  return !endpoint.events?.length || endpoint.events.includes(event);
}

function normalizeMsgtype(endpoint) {
  const explicit = String(endpoint.msgtype || '').toLowerCase();
  if (WEBHOOK_MSG_TYPES.includes(explicit)) return explicit;

  const legacyType = String(endpoint.type || '').toLowerCase();
  if (legacyType.includes('markdown')) return 'markdown';
  if (legacyType.includes('text')) return 'text';
  return 'json';
}

export function normalizeWebhookEndpoints(input) {
  const raw = Array.isArray(input) ? input : [];
  return raw
    .map((item, index) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
      const endpoint = { ...item };
      const url = String(endpoint.url || '').trim();
      const msgtype = normalizeMsgtype(endpoint);
      try {
        new URL(url);
      } catch {
        return null;
      }
      return {
        id: String(endpoint.id || `${Date.now()}-${index}`),
        name: String(endpoint.name || '').trim(),
        msgtype,
        url,
        method: WEBHOOK_METHODS.includes(String(endpoint.method || '').toUpperCase())
          ? String(endpoint.method).toUpperCase()
          : 'POST',
        contentType: String(endpoint.contentType || 'application/json').trim() || 'application/json',
        headers: parseHeaders(endpoint.headers),
        body: String(endpoint.body || ''),
        username: String(endpoint.username || ''),
        password: String(endpoint.password || ''),
        events: normalizeEvents(endpoint.events),
        enabled: endpoint.enabled !== false,
      };
    })
    .filter(Boolean);
}

/**
 * Send a webhook notification to a single URL.
 * @param {string} url
 * @param {WebhookPayload} payload
 * @param {number} [retries]
 * @returns {Promise<boolean>}
 */
async function sendOne(endpoint, payload, retries = MAX_RETRIES) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);
      const url = endpoint.url;
      const res = await fetch(url, buildRequestInit(endpoint, payload, controller));
      clearTimeout(timer);
      if (res.ok) return true;
      // Non-retryable client errors
      if (res.status >= 400 && res.status < 500 && res.status !== 429) return false;
    } catch (_) {
      // Network error or timeout — retry
    }
    if (attempt < retries) {
      await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }
  return false;
}

/**
 * Send webhook notifications to all configured URLs.
 * @param {Array|object|string} envUrls - Webhook endpoint configuration
 * @param {string} event - Event name
 * @param {object} data - Event payload data
 * @returns {Promise<boolean[]>}
 */
export async function notifyWebhook(envUrls, event, data = {}) {
  const endpoints = normalizeWebhookEndpoints(envUrls).filter(endpoint => endpoint.enabled && endpointMatchesEvent(endpoint, event));
  if (!endpoints.length) return [];

  /** @type {WebhookPayload} */
  const payload = {
    event,
    timestamp: new Date().toISOString(),
    data,
  };

  return Promise.all(endpoints.map(endpoint => sendOne(endpoint, payload).catch(() => false)));
}

export async function testWebhookEndpoint(endpoint) {
  const normalized = normalizeWebhookEndpoints([endpoint])[0];
  if (!normalized) return { success: false, message: 'Invalid webhook URL' };
  const payload = {
    event: 'webhook.test',
    timestamp: new Date().toISOString(),
    data: { message: `这是一条来自 O-Drive 的 ${endpointLabel(normalized)} 测试通知。` },
  };
  const success = await sendOne(normalized, payload, 0);
  return { success, msgtype: normalized.msgtype, name: endpointLabel(normalized), message: success ? '测试发送成功' : '测试发送失败' };
}

/**
 * Convenience: notify file uploaded.
 */
export function notifyFileUploaded(envUrls, filePath, size, uploader = 'admin') {
  return notifyWebhook(envUrls, 'file.uploaded', { path: filePath, size, uploader });
}

/**
 * Convenience: notify file deleted.
 */
export function notifyFileDeleted(envUrls, paths, permanent = false) {
  return notifyWebhook(envUrls, permanent ? 'file.purged' : 'file.deleted', { paths });
}

/**
 * Convenience: notify file moved/copied.
 */
export function notifyFileMoved(envUrls, action, paths, targetDir) {
  return notifyWebhook(envUrls, action === 'move' ? 'file.moved' : 'file.copied', { paths, targetDir });
}

/**
 * Convenience: notify folder created.
 */
export function notifyFolderCreated(envUrls, path) {
  return notifyWebhook(envUrls, 'folder.created', { path });
}

/**
 * Convenience: notify file renamed.
 */
export function notifyFileRenamed(envUrls, oldPath, newName) {
  return notifyWebhook(envUrls, 'file.renamed', { oldPath, newName });
}
