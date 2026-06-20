import { ensureCoreTables, jsonResponse } from "./common.js";
import { tokenSecretStatus } from "./secrets.js";

async function checkDb(env) {
  if (!env.D1)
    return { bound: false, ok: false, message: "D1 binding missing" };
  try {
    await env.D1.prepare("SELECT 1").first();
    let tables = [];
    try {
      const res = await env.D1.prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name ASC",
      ).all();
      tables = (res.results || []).map((row) => row.name).filter(Boolean);
    } catch (_) {}
    return { bound: true, ok: true, tables };
  } catch (e) {
    return { bound: true, ok: false, message: e.message || "D1 check failed" };
  }
}

async function checkR2(env) {
  if (!env.R2)
    return { bound: false, ok: false, message: "R2 binding missing" };
  try {
    await env.R2.list({ limit: 1 });
    return { bound: true, ok: true };
  } catch (e) {
    return { bound: true, ok: false, message: e.message || "R2 check failed" };
  }
}

async function latestSystemWarnings(env) {
  try {
    const rows = await env.D1.prepare(
      "SELECT * FROM system_warnings WHERE acknowledged_at = 0 ORDER BY created_at DESC, id DESC LIMIT 10",
    ).all();
    return rows.results || [];
  } catch (_) {
    return [];
  }
}

export async function handleAdminHealth(env) {
  await ensureCoreTables(env);
  const [db, r2, warnings] = await Promise.all([
    checkDb(env),
    checkR2(env),
    latestSystemWarnings(env),
  ]);
  const tokenSecret = tokenSecretStatus(env);
  const envStatus = {
    adminUsername: Boolean(env.ADMIN_USERNAME),
    adminPassword: Boolean(env.ADMIN_PASSWORD),
    tokenSecret,
    allowGuestConfigured: Object.prototype.hasOwnProperty.call(
      env,
      "ALLOW_GUEST",
    ),
    guestEnabled: env.ALLOW_GUEST === "true",
  };
  const ok =
    db.ok && r2.ok && envStatus.adminUsername && envStatus.adminPassword;

  return jsonResponse({
    ok,
    db,
    r2,
    env: envStatus,
    warnings,
  });
}
