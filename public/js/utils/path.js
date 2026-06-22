export function normalizeKey(value = "") {
  return String(value || "").replace(/^\/+|\/+$/g, "");
}

export function encodeRouteKey(value = "") {
  return normalizeKey(value)
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

export function getInitialPath() {
  const value = new URLSearchParams(window.location.search).get("path") || "";
  return normalizeKey(value);
}

export function getInitialSearch() {
  return new URLSearchParams(window.location.search).get("q") || "";
}

export function getShareToken() {
  const url = new URL(window.location.href);
  return url.searchParams.get("token") || url.searchParams.get("share") || "";
}
