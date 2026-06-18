export function createDeferredAction(kind, payload = {}) {
  return { kind, ...payload };
}

export function syncHomeUrl(page, path, query) {
  if (page !== 'home') return;
  const url = new URL(window.location.href);
  if (path) url.searchParams.set('path', path);
  else url.searchParams.delete('path');
  if (query) url.searchParams.set('q', query);
  else url.searchParams.delete('q');
  window.history.replaceState({}, '', url.toString());
}

export function openDownload(apiClient, getEntryPath, entry) {
  const downloadUrl = apiClient.downloadUrl(getEntryPath(entry));
  if (!downloadUrl) return;
  window.location.href = downloadUrl;
}
