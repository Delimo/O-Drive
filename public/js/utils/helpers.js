export function createDeferredAction(kind, payload = {}) {
  return { kind, ...payload };
}

export function syncHomeUrl(page, path, query) {
  if (page !== "home") return;
  const url = new URL(window.location.href);
  if (path) url.searchParams.set("path", path);
  else url.searchParams.delete("path");
  if (query) url.searchParams.set("q", query);
  else url.searchParams.delete("q");
  window.history.replaceState({}, "", url.toString());
}

export function openDownload(apiClient, getEntryPath, entry) {
  const downloadUrl = apiClient.downloadUrl(getEntryPath(entry));
  if (!downloadUrl) return;
  window.location.href = downloadUrl;
}

export async function readDroppedEntries(dataTransfer) {
  const files = [];
  const items = dataTransfer.items;
  if (items?.length) {
    const entries = Array.from(items)
      .map((item) => item.webkitGetAsEntry())
      .filter(Boolean);
    for (const entry of entries) {
      await readEntryRecursive(entry, files);
    }
  } else if (dataTransfer.files?.length) {
    for (const f of dataTransfer.files) files.push(f);
  }
  return files;
}

async function readEntryRecursive(entry, result) {
  if (entry.isFile) {
    const file = await new Promise((resolve) => entry.file(resolve));
    result.push(file);
  } else if (entry.isDirectory) {
    const reader = entry.createReader();
    let entries;
    do {
      entries = await new Promise((resolve) => reader.readEntries(resolve));
      for (const child of entries) {
        await readEntryRecursive(child, result);
      }
    } while (entries.length > 0);
  }
}
