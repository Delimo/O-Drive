export const API_ROUTE_POLICIES = [
  { prefix: "/api/admin/settings/hidden", methods: ["POST", "DELETE"], csrf: true },
  { prefix: "/api/admin/settings/protected", methods: ["POST", "DELETE"], csrf: true },
  { prefix: "/api/admin/maintenance", methods: ["POST"], csrf: true },
  { prefix: "/api/paste", methods: ["POST"], csrf: true },
  { prefix: "/api/files", methods: ["POST", "PUT"], csrf: true },
  { prefix: "/api/batch-delete", methods: ["POST"], csrf: true },
  { prefix: "/api/operation-estimate", methods: ["POST"], csrf: true },
  { prefix: "/api/trash/restore-preview", methods: ["POST"], csrf: true },
  { prefix: "/api/trash/restore-batch", methods: ["POST"], csrf: true },
  { prefix: "/api/trash/restore", methods: ["POST"], csrf: true },
  { prefix: "/api/trash/delete", methods: ["DELETE"], csrf: true },
  { prefix: "/api/trash/clear", methods: ["DELETE"], csrf: true },
  { prefix: "/api/trash/cleanup", methods: ["POST"], csrf: true },
  { prefix: "/api/admin/settings/trash-retention", methods: ["PUT"], csrf: true },
  { prefix: "/api/admin/settings/quota", methods: ["PUT"], csrf: true },
  { prefix: "/api/admin/settings/storage", methods: ["PUT"], csrf: true },
  { prefix: "/api/admin/settings/webhooks", methods: ["PUT", "POST"], csrf: true },
  { prefix: "/api/admin/settings/task-alerts", methods: ["PUT"], csrf: true },
  { prefix: "/api/admin/webhook-deliveries/retry", methods: ["POST"], csrf: true },
  { prefix: "/api/admin/shares", methods: ["POST", "DELETE"], csrf: true },
  { prefix: "/api/notifications", methods: ["POST"], csrf: true },
  { prefix: "/api/tasks", methods: ["POST", "PATCH"], csrf: true },
  { prefix: "/api/tasks/retry", methods: ["POST"], csrf: true },
  { prefix: "/api/mkdir", methods: ["POST"], csrf: true },
  { prefix: "/api/upload-multipart/create", methods: ["POST"], csrf: true },
  { prefix: "/api/upload-multipart/part", methods: ["PUT"], csrf: true },
  { prefix: "/api/upload-multipart/complete", methods: ["POST"], csrf: true },
  { prefix: "/api/upload-multipart/abort", methods: ["POST"], csrf: true },
  { prefix: "/api/upload/check", methods: ["POST"], csrf: true },
  { prefix: "/api/save-text/", methods: ["POST"], csrf: true },
  { prefix: "/api/zip-download", methods: ["POST"], csrf: true },
];

const API_ENTRY_POLICIES = [
  { path: "/api/login", methods: ["POST"], preAuth: "login" },
  { path: "/api/logout", preAuth: "logout" },
  { prefix: "/api/share/", preAuth: "publicShare" },
  { path: "/api/auth/role", postAuth: "authRole" },
];

const FILE_ACCESS_PREFIXES = ["/api/download/", "/api/preview/", "/api/thumbnail/", "/api/folder-stats/"];

function prefixMatches(path, prefix) {
  if (path === prefix) return true;
  if (prefix.endsWith("/")) return path.startsWith(prefix);
  return path.startsWith(`${prefix}/`);
}

function routeMatches(policy, path, method) {
  const pathMatches = policy.path ? path === policy.path : prefixMatches(path, policy.prefix);
  const methodMatches = !policy.methods || policy.methods.includes(method);
  return pathMatches && methodMatches;
}

function shouldApplyRateLimit(path) {
  return !FILE_ACCESS_PREFIXES.some(prefix => path.startsWith(prefix));
}

function requiresProtectedAccess(path) {
  return FILE_ACCESS_PREFIXES.some(prefix => path.startsWith(prefix));
}

function isUploadBodyRoute(path, method) {
  return (path.startsWith("/api/files") && method === "POST")
    || (path === "/api/upload-multipart/part" && method === "PUT");
}

function hasRequestBody(method) {
  return ["POST", "PUT", "PATCH", "DELETE"].includes(method);
}

export function getApiRoutePolicy(path, method) {
  const normalizedMethod = String(method || "").toUpperCase();
  const entryRoute = API_ENTRY_POLICIES.find(policy => routeMatches(policy, path, normalizedMethod));
  const route = API_ROUTE_POLICIES.find(policy => routeMatches(policy, path, normalizedMethod));

  return {
    preAuth: entryRoute?.preAuth || "",
    postAuth: entryRoute?.postAuth || "",
    csrf: Boolean(route?.csrf),
    userWritableKey: Boolean(route?.csrf),
    rateLimit: shouldApplyRateLimit(path),
    rateLimitSampleSize: ["GET", "HEAD"].includes(normalizedMethod) ? 10 : 1,
    hasBody: hasRequestBody(normalizedMethod),
    uploadBody: isUploadBodyRoute(path, normalizedMethod),
    protectedAccess: requiresProtectedAccess(path),
  };
}
