/**
 * @fileoverview Webhook notification system for file operations.
 * Sends HTTP POST notifications to configured webhook URLs when
 * significant events occur (file upload, delete, move, etc.).
 *
 * Configured via WEBHOOK_URLS environment variable (comma-separated).
 */

/**
 * @typedef {object} WebhookPayload
 * @property {string} event - Event type (e.g. 'file.uploaded', 'file.deleted')
 * @property {string} timestamp - ISO 8601 timestamp
 * @property {object} data - Event-specific data
 */

const WEBHOOK_TIMEOUT_MS = 5000;
const MAX_RETRIES = 2;

/**
 * Parse webhook URLs from environment.
 * @param {string} envUrls
 * @returns {string[]}
 */
function parseWebhookUrls(envUrls) {
  if (!envUrls) return [];
  return envUrls
    .split(',')
    .map(url => url.trim())
    .filter(url => {
      try {
        new URL(url);
        return true;
      } catch {
        return false;
      }
    });
}

/**
 * Send a webhook notification to a single URL.
 * @param {string} url
 * @param {WebhookPayload} payload
 * @param {number} [retries]
 * @returns {Promise<boolean>}
 */
async function sendOne(url, payload, retries = MAX_RETRIES) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
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
 * Fire-and-forget webhook notification to all configured URLs.
 * @param {string} envUrls - WEBHOOK_URLS env value
 * @param {string} event - Event name
 * @param {object} data - Event payload data
 */
export function notifyWebhook(envUrls, event, data = {}) {
  const urls = parseWebhookUrls(envUrls);
  if (!urls.length) return;

  /** @type {WebhookPayload} */
  const payload = {
    event,
    timestamp: new Date().toISOString(),
    data,
  };

  // Fire and forget — don't block the response
  for (const url of urls) {
    sendOne(url, payload).catch(() => {});
  }
}

/**
 * Convenience: notify file uploaded.
 */
export function notifyFileUploaded(envUrls, filePath, size, uploader = 'admin') {
  notifyWebhook(envUrls, 'file.uploaded', { path: filePath, size, uploader });
}

/**
 * Convenience: notify file deleted.
 */
export function notifyFileDeleted(envUrls, paths, permanent = false) {
  notifyWebhook(envUrls, permanent ? 'file.purged' : 'file.deleted', { paths });
}

/**
 * Convenience: notify file moved/copied.
 */
export function notifyFileMoved(envUrls, action, paths, targetDir) {
  notifyWebhook(envUrls, action === 'move' ? 'file.moved' : 'file.copied', { paths, targetDir });
}

/**
 * Convenience: notify folder created.
 */
export function notifyFolderCreated(envUrls, path) {
  notifyWebhook(envUrls, 'folder.created', { path });
}

/**
 * Convenience: notify file renamed.
 */
export function notifyFileRenamed(envUrls, oldPath, newName) {
  notifyWebhook(envUrls, 'file.renamed', { oldPath, newName });
}