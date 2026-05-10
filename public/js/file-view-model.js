export function getOrderedEntries(fileData, sortBy) {
  const folders = [...(fileData.folders || [])]
    .filter(f => f.name && f.name.trim() !== '')
    .sort((a, b) => a.name.localeCompare(b.name));

  const files = [...(fileData.files || [])]
    .filter(f => f.name && f.name.trim() !== '')
    .sort((a, b) => {
      if (sortBy === 'time') return (b.time || 0) - (a.time || 0);
      if (sortBy === 'size') return (b.rawSize || 0) - (a.rawSize || 0);
      return a.name.localeCompare(b.name);
    });

  return [...folders, ...files];
}

export function getSelectableKeys(fileData) {
  return getOrderedEntries(fileData, 'name')
    .filter(i => i.name !== '' && i.name !== '.folder')
    .map(i => i.fullKey);
}
