export function createStateSelectors(deps) {
  const { formatBytes, inferKind, normalizeKey, isProtectedEntry } = deps;

  function applySort(entries, mode) {
    const list = [...entries];
    const alpha = (a, b) =>
      a.name.localeCompare(b.name, "zh-CN", {
        numeric: true,
        sensitivity: "base",
      });

    list.sort((a, b) => {
      if (mode === "smart" && a.kind === "folder" && b.kind !== "folder")
        return -1;
      if (mode === "smart" && a.kind !== "folder" && b.kind === "folder")
        return 1;
      if (mode === "time") {
        if ((b.time || 0) !== (a.time || 0))
          return (b.time || 0) - (a.time || 0);
        return alpha(a, b);
      }
      if (mode === "size") {
        if ((b.rawSize || 0) !== (a.rawSize || 0))
          return (b.rawSize || 0) - (a.rawSize || 0);
        return alpha(a, b);
      }
      return alpha(a, b);
    });

    return list;
  }

  function entryKey(entry) {
    return entry.trashId || entry.fullKey || entry.path || entry.name;
  }

  function getEntryPath(entry) {
    return entry.fullKey || entry.path || entry.original_key || "";
  }

  function currentEntries(state) {
    const explorer = state.explorer;

    if (explorer.trashMode) {
      return applySort(
        explorer.trashItems
          .map((item) => ({
            ...item,
            kind: item.kind || "file",
            fullKey: item.original_key || "",
            name: item.name || "",
            rawSize: Number(item.size || 0),
            time: Number(item.trashed_at || 0),
            sizeFormatted: formatBytes(item.size || 0),
            trashedAt: Number(item.trashed_at || 0),
            trashId: item.id,
          }))
          .filter(
            (item) =>
              explorer.filter === "all" || item.kind === explorer.filter,
          ),
        explorer.sort,
      );
    }

    const folders = (explorer.folders || []).map((item) => ({
      ...item,
      kind: "folder",
      rawSize: 0,
      time: Number(item.time || 0),
    }));
    const files = (explorer.files || []).map((item) => ({
      ...item,
      kind: inferKind(item),
      rawSize: Number(item.rawSize || item.size || 0),
      time: Number(item.time || item.uploaded || 0),
      searchHit: item.searchHit || null,
    }));
    const filteredFolders =
      explorer.filter === "all" || explorer.filter === "folder" ? folders : [];
    const filteredFiles = files.filter(
      (item) => explorer.filter === "all" || item.kind === explorer.filter,
    );

    return applySort(
      [...filteredFolders, ...filteredFiles],
      explorer.sort,
    );
  }

  function getSelectedEntry(state) {
    const key = state.explorer.selectedKey;
    if (!key) return null;
    return currentEntries(state).find((item) => entryKey(item) === key) || null;
  }

  function detectContentMode(entry) {
    const kind = entry.kind || inferKind(entry);
    if (
      kind === "image" ||
      kind === "video" ||
      kind === "audio" ||
      kind === "pdf"
    )
      return kind;
    return "text";
  }

  function findCurrentEntryByPath(state, path) {
    const normalized = normalizeKey(path);
    return (
      currentEntries(state).find(
        (item) => normalizeKey(getEntryPath(item)) === normalized,
      ) || null
    );
  }

  function selectedEntriesFromState(state) {
    const entries = currentEntries(state);
    const keys = state.explorer.trashMode
      ? state.explorer.trashSelectedKeys
      : state.explorer.selectedKeys;
    return entries.filter((item) => keys.includes(entryKey(item)));
  }

  function requiresProtectedUnlock(entry) {
    return isProtectedEntry(entry);
  }

  function findEntryByKey(state, key) {
    return currentEntries(state).find((item) => entryKey(item) === key) || null;
  }

  function collectSelectedPaths(state, getEntryPathFn) {
    return state.explorer.selectedKeys
      .map((id) => findEntryByKey(state, id))
      .filter(Boolean)
      .map((item) => getEntryPathFn(item))
      .filter(Boolean);
  }

  return {
    currentEntries,
    getSelectedEntry,
    entryKey,
    getEntryPath,
    detectContentMode,
    findCurrentEntryByPath,
    findEntryByKey,
    collectSelectedPaths,
    selectedEntriesFromState,
    requiresProtectedUnlock,
  };
}
