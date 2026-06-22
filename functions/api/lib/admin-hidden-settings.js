import { addLog, jsonResponse, normalizeHiddenPath } from "./common/index.js";
import { clearHiddenPathsCache } from "./request-context.js";

export async function handleHiddenSettings(
  env,
  request,
  method,
  url,
  hiddenPaths,
) {
  if (method === "GET")
    return jsonResponse({ list: hiddenPaths.map((p) => ({ path: p })) });
  if (method === "POST") {
    const targetPath = normalizeHiddenPath((await request.json()).targetPath);
    await env.D1.prepare(
      "INSERT OR IGNORE INTO settings (key, value) VALUES (?, 'hidden')",
    )
      .bind(targetPath)
      .run();
    await addLog(env, request, "HIDE", `隐藏路径 ${targetPath}`);
    clearHiddenPathsCache();
    return jsonResponse({ success: true });
  }
  if (method === "DELETE") {
    const targetPath = normalizeHiddenPath(url.searchParams.get("path"));
    await env.D1.prepare("DELETE FROM settings WHERE key = ?")
      .bind(targetPath)
      .run();
    await addLog(env, request, "UNHIDE", `取消隐藏路径 ${targetPath}`);
    clearHiddenPathsCache();
    return jsonResponse({ success: true });
  }
  return jsonResponse({ message: "Method Not Allowed" }, 405);
}
