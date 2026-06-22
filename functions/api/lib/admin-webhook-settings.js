import { addLog, jsonResponse } from "./common/index.js";
import {
  loadWebhookEndpoints,
  normalizeWebhookEndpoints,
  testWebhookEndpoint,
} from "./webhooks.js";

export async function handleAdminWebhooks(env, request, method) {
  if (method === "GET") {
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
    const endpoints = normalizeWebhookEndpoints(items);
    return jsonResponse({
      items: endpoints,
      urls: endpoints.map((endpoint) => endpoint.url),
    });
  }
  if (method === "PUT") {
    const body = await request.json().catch(() => ({}));
    const endpoints = normalizeWebhookEndpoints(body.items || []);
    if (endpoints.length) {
      await env.D1.prepare(
        "INSERT OR REPLACE INTO kv_config (key, value) VALUES (?, ?)",
      )
        .bind("webhooks", JSON.stringify(endpoints))
        .run();
    } else {
      await env.D1.prepare(
        "DELETE FROM kv_config WHERE key = 'webhooks'",
      ).run();
    }
    await addLog(
      env,
      request,
      "WEBHOOKS",
      `保存 Webhook 配置 ${endpoints.length} 条`,
    );
    return jsonResponse({
      success: true,
      items: endpoints,
      urls: endpoints.map((endpoint) => endpoint.url),
    });
  }
  if (method === "POST") {
    const body = await request.json().catch(() => ({}));
    const endpoint = body.endpoint || body;
    const result = await testWebhookEndpoint(endpoint, env);
    await addLog(
      env,
      request,
      "WEBHOOK_TEST",
      `${result.success ? "测试成功" : "测试失败"}：${endpoint.name || endpoint.url || "Webhook"}`,
    );
    return jsonResponse(result, result.success ? 200 : 502);
  }
  return jsonResponse({ message: "Method Not Allowed" }, 405);
}

export async function handleAdminWebhookDeliveries(env) {
  try {
    const rows = await env.D1.prepare(
      "SELECT * FROM webhook_deliveries ORDER BY created_at DESC, id DESC LIMIT 20",
    ).all();
    return jsonResponse({ items: rows.results || [] });
  } catch (_) {
    return jsonResponse({ items: [] });
  }
}
