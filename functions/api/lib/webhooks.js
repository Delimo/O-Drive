/**
 * @fileoverview Webhook notification system for file operations.
 * Sends HTTP POST notifications to configured webhook URLs when
 * significant events occur (file upload, delete, move, etc.).
 *
 * Configured from the admin Webhook settings stored in D1.
 */
import { ensureCoreTables, recordSystemWarning } from "./common/index.js";
import { createNotification } from "./notifications.js";

/**
 * @typedef {object} WebhookPayload
 * @property {string} event - Event type (e.g. 'file.uploaded', 'file.deleted')
 * @property {string} timestamp - ISO 8601 timestamp
 * @property {object} data - Event-specific data
 */

const WEBHOOK_TIMEOUT_MS = 5000;
const MAX_RETRIES = 2;
const DELIVERY_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const DELIVERY_RETENTION_ROWS = 200;
const WEBHOOK_MSG_TYPES = ["json", "text", "markdown"];
const WEBHOOK_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];
const WEBHOOK_EVENTS = [
  "file.uploaded",
  "file.deleted",
  "file.purged",
  "file.moved",
  "file.copied",
  "file.renamed",
  "folder.created",
  "download.burst",
  "login.burst",
  "share.expired",
];

function endpointLabel(endpoint) {
  if (endpoint.name) return endpoint.name;
  return "通用";
}

function eventLabel(event) {
  const labels = {
    "file.uploaded": "上传",
    "file.deleted": "删除",
    "file.purged": "彻底删除",
    "file.moved": "移动",
    "file.copied": "复制",
    "file.renamed": "重命名",
    "folder.created": "新建文件夹",
    "download.burst": "下载异常提醒",
    "login.burst": "登录异常提醒",
    "share.expired": "分享链接到期",
    "webhook.test": "测试通知",
  };
  return labels[event] || event;
}

function formatChinaTime(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value || "");
  return date.toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour12: false,
  });
}

function textPayload(payload) {
  const data = payload.data || {};
  const label = eventLabel(payload.event);
  const lines = [
    `O-Drive ${label}`,
    `事件：${label}`,
    `时间：${formatChinaTime(payload.timestamp)}`,
  ];
  if (data.path) lines.push(`路径：${data.path}`);
  if (data.oldPath) lines.push(`原路径：${data.oldPath}`);
  if (data.newName) lines.push(`新名称：${data.newName}`);
  if (data.paths)
    lines.push(
      `对象：${Array.isArray(data.paths) ? data.paths.join(", ") : data.paths}`,
    );
  if (data.targetDir) lines.push(`目标目录：${data.targetDir}`);
  if (data.count) lines.push(`下载次数：${data.count}`);
  if (data.attempts) lines.push(`尝试次数：${data.attempts}`);
  if (data.threshold) lines.push(`提醒阈值：${data.threshold}`);
  if (data.windowSeconds) lines.push(`时间窗口：${data.windowSeconds} 秒`);
  if (data.lockoutSeconds) lines.push(`锁定时长：${data.lockoutSeconds} 秒`);
  if (data.blockSeconds) lines.push(`禁止下载：${data.blockSeconds} 秒`);
  if (data.blockedUntil)
    lines.push(`禁止至：${formatChinaTime(data.blockedUntil)}`);
  if (data.ip) lines.push(`来源 IP：${data.ip}`);
  if (data.role) lines.push(`访问角色：${data.role}`);
  if (data.username) lines.push(`用户名：${data.username}`);
  if (data.samplePaths)
    lines.push(
      `下载样例：${Array.isArray(data.samplePaths) ? data.samplePaths.join(", ") : data.samplePaths}`,
    );
  if (data.message) lines.push(`说明：${data.message}`);
  if (data.token) lines.push(`分享 Token：${data.token}`);
  if (data.expiresAt)
    lines.push(`到期时间：${formatChinaTime(data.expiresAt)}`);
  if (data.name) lines.push(`名称：${data.name}`);
  return lines.join("\n");
}

function formatPayload(endpoint, payload) {
  if (endpoint.msgtype === "text") {
    return {
      msgtype: "text",
      text: { content: textPayload(payload) },
    };
  }
  if (endpoint.msgtype === "markdown") {
    return {
      msgtype: "markdown",
      markdown: { content: textPayload(payload) },
    };
  }
  return payload;
}

function parseHeaders(headers) {
  if (!headers) return {};
  if (typeof headers === "string") {
    try {
      return parseHeaders(JSON.parse(headers));
    } catch {
      return {};
    }
  }
  if (typeof headers !== "object" || Array.isArray(headers)) return {};
  return Object.fromEntries(
    Object.entries(headers)
      .map(([key, value]) => [String(key).trim(), String(value ?? "")])
      .filter(([key]) => key && !/[\r\n:]/.test(key)),
  );
}

function readPayloadPath(payload, path) {
  return String(path || "")
    .split(".")
    .filter(Boolean)
    .reduce((value, part) => value && value[part], payload);
}

function renderTemplate(source, payload) {
  return String(source || "").replace(
    /\{\{\s*([\w.]+)\s*\}\}|\{\s*([\w.]+)\s*\}/g,
    (_, a, b) => {
      const value = readPayloadPath(payload, a || b);
      if (value == null) return "";
      return typeof value === "object" ? JSON.stringify(value) : String(value);
    },
  );
}

function formatBody(endpoint, payload) {
  if (endpoint.body) return renderTemplate(endpoint.body, payload);
  return JSON.stringify(formatPayload(endpoint, payload));
}

function buildRequestInit(endpoint, payload, controller) {
  const method = endpoint.method || "POST";
  const headers = {
    ...(endpoint.contentType ? { "Content-Type": endpoint.contentType } : {}),
    ...parseHeaders(endpoint.headers),
  };
  const init = { method, headers, signal: controller.signal };
  if (!["GET", "HEAD"].includes(method))
    init.body = formatBody(endpoint, payload);
  return init;
}

function normalizeEvents(events) {
  if (!Array.isArray(events)) return [];
  return [
    ...new Set(
      events
        .map((event) => String(event || "").trim())
        .filter((event) => WEBHOOK_EVENTS.includes(event)),
    ),
  ];
}

function endpointMatchesEvent(endpoint, event) {
  return !endpoint.events?.length || endpoint.events.includes(event);
}

function normalizeMsgtype(endpoint) {
  const explicit = String(endpoint.msgtype || "").toLowerCase();
  if (WEBHOOK_MSG_TYPES.includes(explicit)) return explicit;

  const legacyType = String(endpoint.type || "").toLowerCase();
  if (legacyType.includes("markdown")) return "markdown";
  if (legacyType.includes("text")) return "text";
  return "json";
}

export function normalizeWebhookEndpoints(input) {
  const raw = Array.isArray(input) ? input : [];
  return raw
    .map((item, index) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      const endpoint = { ...item };
      const url = String(endpoint.url || "").trim();
      const msgtype = normalizeMsgtype(endpoint);
      try {
        new URL(url);
      } catch {
        return null;
      }
      return {
        id: String(endpoint.id || `${Date.now()}-${index}`),
        name: String(endpoint.name || "").trim(),
        msgtype,
        url,
        method: WEBHOOK_METHODS.includes(
          String(endpoint.method || "").toUpperCase(),
        )
          ? String(endpoint.method).toUpperCase()
          : "POST",
        contentType:
          String(endpoint.contentType || "application/json").trim() ||
          "application/json",
        headers: parseHeaders(endpoint.headers),
        body: String(endpoint.body || ""),
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
  const started = Date.now();
  let lastStatus = 0;
  let lastError = "";
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);
      const url = endpoint.url;
      const parsed = new URL(url);
      const hostname = parsed.hostname.toLowerCase();
      if (
        hostname === "localhost" ||
        hostname === "127.0.0.1" ||
        hostname === "0.0.0.0" ||
        hostname === "[::1]" ||
        hostname.startsWith("10.") ||
        hostname.startsWith("172.") && (Number(hostname.split(".")[1]) >= 16 && Number(hostname.split(".")[1]) <= 31) ||
        hostname.startsWith("192.168.") ||
        hostname === "169.254.169.254"
      ) {
        return {
          ok: false, status: 0, error: "Webhook URL points to private IP range",
          durationMs: Date.now() - started,
        };
      }
      const res = await fetch(
        url,
        buildRequestInit(endpoint, payload, controller),
      );
      clearTimeout(timer);
      lastStatus = res.status;
      if (res.ok)
        return {
          ok: true,
          status: res.status,
          error: "",
          durationMs: Date.now() - started,
        };
      // Non-retryable client errors
      if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        return {
          ok: false,
          status: res.status,
          error: `HTTP ${res.status}`,
          durationMs: Date.now() - started,
        };
      }
      lastError = `HTTP ${res.status}`;
    } catch (err) {
      // Network error or timeout: retry.
      lastError =
        err?.name === "AbortError"
          ? "Timeout"
          : err?.message || "Network error";
    }
    if (attempt < retries) {
      await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }
  return {
    ok: false,
    status: lastStatus,
    error: lastError,
    durationMs: Date.now() - started,
  };
}

async function recordDelivery(env, endpoint, event, result) {
  if (!env?.D1) return;
  try {
    await ensureCoreTables(env);
    const createdAt = Date.now();
    await env.D1.prepare(
      "INSERT INTO webhook_deliveries (event, endpoint, url, ok, status, error, duration_ms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
      .bind(
        event,
        endpoint.name || endpointLabel(endpoint),
        endpoint.url,
        result.ok ? 1 : 0,
        Number(result.status || 0),
        result.error || "",
        Number(result.durationMs || 0),
        createdAt,
      )
      .run();
    await cleanupWebhookDeliveries(env, createdAt);
  } catch (_) {}
}

async function cleanupWebhookDeliveries(env, now = Date.now()) {
  const cutoff = now - DELIVERY_RETENTION_MS;
  await env.D1.prepare("DELETE FROM webhook_deliveries WHERE created_at < ?")
    .bind(cutoff)
    .run();
  try {
    const cutoff = await env.D1.prepare(
      "SELECT id FROM webhook_deliveries ORDER BY id DESC LIMIT 1 OFFSET ?",
    ).bind(DELIVERY_RETENTION_ROWS).first();
    if (cutoff?.id) {
      await env.D1.prepare("DELETE FROM webhook_deliveries WHERE id < ?").bind(cutoff.id).run();
    }
  } catch (_) {}
}

/**
 * Send webhook notifications to all configured URLs.
 * @param {Array|object|string} envUrls - Webhook endpoint configuration
 * @param {string} event - Event name
 * @param {object} data - Event payload data
 * @returns {Promise<boolean[]>}
 */
export async function notifyWebhook(envUrls, event, data = {}) {
  const endpoints = normalizeWebhookEndpoints(envUrls).filter(
    (endpoint) => endpoint.enabled && endpointMatchesEvent(endpoint, event),
  );
  if (!endpoints.length) return [];

  /** @type {WebhookPayload} */
  const payload = {
    event,
    timestamp: new Date().toISOString(),
    data,
  };

  const results = await Promise.all(
    endpoints.map((endpoint) =>
      sendOne(endpoint, payload).catch(() => ({ ok: false })),
    ),
  );
  return results.map((result) => Boolean(result.ok));
}

export async function notifyWebhookWithLog(env, envUrls, event, data = {}) {
  const endpoints = normalizeWebhookEndpoints(envUrls).filter(
    (endpoint) => endpoint.enabled && endpointMatchesEvent(endpoint, event),
  );

  const msg = eventLabel(event) || event;
  const path = data?.path || data?.paths?.[0] || "";
  const eventMessage = path ? `${msg}: ${path}` : msg;
  createNotification(env, { event, message: eventMessage, path }).catch(
    () => {},
  );

  if (!endpoints.length) return [];

  const payload = {
    event,
    timestamp: new Date().toISOString(),
    data,
  };

  const results = await Promise.all(
    endpoints.map((endpoint) =>
      sendOne(endpoint, payload)
        .then(async (result) => {
          await recordDelivery(env, endpoint, event, result);
          return result;
        })
        .catch(async (err) => {
          const result = {
            ok: false,
            status: 0,
            error: err?.message || "Webhook failed",
            durationMs: 0,
          };
          await recordDelivery(env, endpoint, event, result);
          return result;
        }),
    ),
  );

  return results.map((result) => Boolean(result.ok));
}

export async function testWebhookEndpoint(endpoint, env = null) {
  const normalized = normalizeWebhookEndpoints([endpoint])[0];
  if (!normalized) return { success: false, message: "Invalid webhook URL" };
  const payload = {
    event: "webhook.test",
    timestamp: new Date().toISOString(),
    data: {
      message: `这是一条来自 O-Drive 的 ${endpointLabel(normalized)} 测试通知。`,
    },
  };
  const result = await sendOne(normalized, payload, 0);
  await recordDelivery(env, normalized, "webhook.test", result);
  return {
    success: result.ok,
    status: result.status,
    durationMs: result.durationMs,
    msgtype: normalized.msgtype,
    name: endpointLabel(normalized),
    message: result.ok ? "测试发送成功" : "测试发送失败",
  };
}

/**
 * Convenience: notify file uploaded.
 */
export function notifyFileUploaded(
  envUrls,
  filePath,
  size,
  uploader = "admin",
) {
  return notifyWebhook(envUrls, "file.uploaded", {
    path: filePath,
    size,
    uploader,
  });
}

/**
 * Convenience: notify file deleted.
 */
export function notifyFileDeleted(envUrls, paths, permanent = false) {
  return notifyWebhook(envUrls, permanent ? "file.purged" : "file.deleted", {
    paths,
  });
}

/**
 * Convenience: notify file moved/copied.
 */
export function notifyFileMoved(envUrls, action, paths, targetDir) {
  return notifyWebhook(
    envUrls,
    action === "move" ? "file.moved" : "file.copied",
    { paths, targetDir },
  );
}

/**
 * Convenience: notify folder created.
 */
export function notifyFolderCreated(envUrls, path) {
  return notifyWebhook(envUrls, "folder.created", { path });
}

/**
 * Convenience: notify file renamed.
 */
export function notifyFileRenamed(envUrls, oldPath, newName) {
  return notifyWebhook(envUrls, "file.renamed", { oldPath, newName });
}

export async function loadWebhookEndpoints(env) {
  if (env._webhookEndpoints) return env._webhookEndpoints;
  let items = [];
  try {
    const row = await env.D1.prepare(
      "SELECT value FROM kv_config WHERE key = 'webhooks'",
    ).first();
    if (row?.value) items = JSON.parse(row.value);
  } catch (err) {
    await recordSystemWarning(
      env,
      "webhooks.config",
      err?.message || "Webhook settings load failed",
    );
  }
  env._webhookEndpoints = normalizeWebhookEndpoints(items);
  return env._webhookEndpoints;
}

export function notifyDownloadBurst(envUrls, alert) {
  return notifyWebhook(envUrls, "download.burst", alert);
}

export function notifyLoginBurst(envUrls, alert) {
  return notifyWebhook(envUrls, "login.burst", alert);
}

export function notifyShareExpired(envUrls, share) {
  return notifyWebhook(envUrls, "share.expired", share);
}
