import { state } from './state.js';
import { api } from './api.js';
import { UI, Message } from './ui.js';
import { PreviewActions } from './preview-actions.js';
import { escapeHtml } from './utils.js';
import { readableError } from './file-operation-utils.js';

const RECENT_SEARCH_KEY = 'o-drive-recent-searches';

function recentSearches() {
  try {
    const items = JSON.parse(localStorage.getItem(RECENT_SEARCH_KEY) || '[]');
    return Array.isArray(items) ? items.filter(Boolean).slice(0, 6) : [];
  } catch (_) {
    return [];
  }
}

function rememberSearch(query) {
  const q = String(query || '').trim();
  if (!q) return;
  const next = [q, ...recentSearches().filter(item => item !== q)].slice(0, 6);
  localStorage.setItem(RECENT_SEARCH_KEY, JSON.stringify(next));
}

export function createFileSearchActions() {
  return {
    async handleSearch() {
      const desktopInput = document.getElementById('searchInput');
      const mobileInput = document.getElementById('mobileSearchInput');
      const activeInput = mobileInput && mobileInput.offsetParent ? mobileInput : desktopInput;
      const q = activeInput?.value.trim() || '';
      if (!q) return this.clearSearch();
      rememberSearch(q);
      state.isSearching = true;
      state.search = { query: q, scope: state.currentPath, nextCursor: '', loadingMore: false, filters: { ...state.filters } };

      const { res, data } = await api.searchFiles(q, state.currentPath, '', state.search.filters);
      if (!res.ok) {
        if (data?.code === 'password_required') return PreviewActions.handlePasswordRequired(data, () => this.handleSearch());
        Message.error(readableError(res, data, '搜索失败'));
        return;
      }
      state.fileData = { folders: [], files: data?.files || [] };
      state.search.nextCursor = data?.nextCursor || '';
      UI.updateFileList();
      UI.renderSearchBreadcrumb(q);
    },

    async loadMoreSearch() {
      if (!state.isSearching || !state.search?.nextCursor || state.search.loadingMore) return;
      state.search.loadingMore = true;
      UI.updateFileList();
      const { res, data } = await api.searchFiles(state.search.query, state.search.scope, state.search.nextCursor, state.search.filters);
      state.search.loadingMore = false;
      if (!res.ok) {
        Message.error(data?.message || '加载更多失败');
        UI.updateFileList();
        return;
      }
      state.fileData = {
        folders: [],
        files: [...(state.fileData.files || []), ...(data?.files || [])],
      };
      state.search.nextCursor = data?.nextCursor || '';
      UI.updateFileList();
    },

    clearSearch() {
      state.isSearching = false;
      state.search = { query: '', scope: '/', nextCursor: '', loadingMore: false };
      const desktopInput = document.getElementById('searchInput');
      if (desktopInput) desktopInput.value = '';
      const mobileInput = document.getElementById('mobileSearchInput');
      if (mobileInput) mobileInput.value = '';
      this.loadFiles();
    },

    renderSearchSuggestions() {
      const items = recentSearches();
      const markup = items.length
        ? items.map(item => `<button class="search-suggestion-item" data-action="use-recent-search" data-args='${escapeHtml(JSON.stringify([item]))}'>${escapeHtml(item)}</button>`).join('')
        : '<span class="search-suggestion-empty">暂无最近搜索</span>';
      ['searchSuggestions', 'mobileSearchSuggestions'].forEach(id => {
        const box = document.getElementById(id);
        if (!box) return;
        box.innerHTML = markup;
        box.classList.remove('hidden');
      });
    },

    useRecentSearch(query) {
      const q = String(query || '').trim();
      if (!q) return;
      const desktopInput = document.getElementById('searchInput');
      const mobileInput = document.getElementById('mobileSearchInput');
      if (desktopInput) desktopInput.value = q;
      if (mobileInput) mobileInput.value = q;
      document.getElementById('searchSuggestions')?.classList.add('hidden');
      document.getElementById('mobileSearchSuggestions')?.classList.add('hidden');
      return this.handleSearch();
    },

    openFilters() {
      const f = state.filters || {};
      document.getElementById('filterKind').value = f.kind || 'all';
      document.getElementById('filterMinSize').value = f.minSize || '';
      document.getElementById('filterMaxSize').value = f.maxSize || '';
      document.getElementById('filterAfter').value = f.modifiedAfter || '';
      document.getElementById('filterBefore').value = f.modifiedBefore || '';
      UI.showModal('filterModal');
    },

    applyFilters() {
      state.filters = {
        kind: document.getElementById('filterKind').value,
        minSize: document.getElementById('filterMinSize').value.trim(),
        maxSize: document.getElementById('filterMaxSize').value.trim(),
        modifiedAfter: document.getElementById('filterAfter').value,
        modifiedBefore: document.getElementById('filterBefore').value,
      };
      UI.closeModal('filterModal');
      if (state.isSearching && state.search?.query) this.handleSearch();
      else UI.updateFileList();
    },

    quickFilter(kind) {
      const select = document.getElementById('filterKind');
      if (select) select.value = kind || 'all';
      return this.applyFilters();
    },

    resetFilters() {
      state.filters = { kind: 'all', minSize: '', maxSize: '', modifiedAfter: '', modifiedBefore: '' };
      UI.closeModal('filterModal');
      if (state.isSearching && state.search?.query) this.handleSearch();
      else UI.updateFileList();
    },
  };
}
