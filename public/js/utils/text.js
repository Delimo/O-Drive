export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function humanError(response, data, fallback) {
  const raw = data?.failed?.[0]?.message || data?.message || "";
  if (response?.status === 401) return "登录状态已失效，请重新登录。";
  if (response?.status === 403) {
    if (/csrf/i.test(raw)) return "安全校验已过期，请刷新页面后重试。";
    return "当前没有权限执行这个操作。";
  }
  if (response?.status === 409)
    return "目标位置存在同名项目，请更换名称后重试。";
  return raw || fallback;
}

export function splitUploadTarget(file, basePath) {
  const relative = String(file.webkitRelativePath || "");
  const relativeParts = relative.split("/").filter(Boolean);
  const targetName = relativeParts.length
    ? relativeParts[relativeParts.length - 1]
    : file.name;
  const relativeDir =
    relativeParts.length > 1 ? relativeParts.slice(0, -1).join("/") : "";
  const targetDir = [basePath, relativeDir].filter(Boolean).join("/");
  return { targetName, targetDir, relativeDir };
}
