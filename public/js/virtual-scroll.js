/**
 * Virtual scroll implementation for large file lists.
 * Only renders items visible in the viewport plus a buffer,
 * using a sentinel approach to maintain scroll position.
 */

const GRID_ROW_HEIGHT = 200;
const LIST_ROW_HEIGHT = 52;
const BUFFER_ROWS = 5;

export class VirtualScroller {
  constructor({ container, itemHeight, viewMode = 'list' }) {
    this.container = container;
    this.itemHeight = itemHeight;
    this.viewMode = viewMode;
    this.items = [];
    this.renderItem = null;
    this.sentinel = null;
    this.spacerTop = null;
    this.spacerBottom = null;
    this.observer = null;
    this._rendered = new Set();
    this._scrollRAF = null;
    this._boundOnScroll = this._onScroll.bind(this);
  }

  mount(items, renderItem) {
    this.items = items;
    this.renderItem = renderItem;
    this._rendered.clear();

    // Create sentinel structure
    this.spacerTop = document.createElement('div');
    this.spacerBottom = document.createElement('div');
    this.sentinel = document.createElement('div');
    this.sentinel.style.height = '1px';
    this.sentinel.style.width = '1px';
    this.sentinel.style.pointerEvents = 'none';

    this.container.appendChild(this.spacerTop);
    this.container.appendChild(this.sentinel);
    this.container.appendChild(this.spacerBottom);

    this._updateLayout();
    this.container.addEventListener('scroll', this._boundOnScroll, { passive: true });
    // Initial render
    this._renderVisible();
  }

  destroy() {
    this.container.removeEventListener('scroll', this._boundOnScroll);
    cancelAnimationFrame(this._scrollRAF);
    this.spacerTop = null;
    this.spacerBottom = null;
    this.sentinel = null;
    this.items = [];
    this._rendered.clear();
  }

  _onScroll() {
    cancelAnimationFrame(this._scrollRAF);
    this._scrollRAF = requestAnimationFrame(() => this._renderVisible());
  }

  _getViewport() {
    const rect = this.container.getBoundingClientRect();
    return {
      top: this.container.scrollTop,
      bottom: this.container.scrollTop + rect.height,
    };
  }

  _updateLayout() {
    const totalHeight = this.items.length * this.itemHeight;
    this.spacerTop.style.height = '0px';
    this.spacerBottom.style.height = '0px';
    this.container.style.position = 'relative';
  }

  _renderVisible() {
    if (!this.container || !this.items.length) return;

    const parent = this.container.parentElement;
    const scrollTop = parent ? parent.scrollTop : this.container.scrollTop;
    const viewportHeight = parent ? parent.clientHeight : this.container.clientHeight;

    const startIdx = Math.max(0, Math.floor(scrollTop / this.itemHeight) - BUFFER_ROWS);
    const endIdx = Math.min(
      this.items.length,
      Math.ceil((scrollTop + viewportHeight) / this.itemHeight) + BUFFER_ROWS
    );

    // Track which items should be visible
    const shouldRender = new Set();
    for (let i = startIdx; i < endIdx; i++) {
      shouldRender.add(i);
    }

    // Remove items that are no longer visible
    for (const idx of this._rendered) {
      if (!shouldRender.has(idx)) {
        const el = this.container.querySelector(`[data-virtual-idx="${idx}"]`);
        if (el) el.remove();
        this._rendered.delete(idx);
      }
    }

    // Add newly visible items
    for (let i = startIdx; i < endIdx; i++) {
      if (this._rendered.has(i)) continue;
      const el = this.renderItem(this.items[i], i);
      if (!el) continue;
      el.dataset.virtualIdx = String(i);
      el.dataset.key = this.items[i].fullKey;

      // Insert at correct position
      const nextSibling = this.container.querySelector(`[data-virtual-idx="${i + 1}"]`);
      if (nextSibling) {
        this.container.insertBefore(el, nextSibling);
      } else if (this.sentinel) {
        this.container.insertBefore(el, this.sentinel);
      } else {
        this.container.appendChild(el);
      }
      this._rendered.add(i);
    }

    // Update spacers
    const topSpace = startIdx * this.itemHeight;
    const bottomSpace = Math.max(0, (this.items.length - endIdx) * this.itemHeight);
    if (this.spacerTop) this.spacerTop.style.height = topSpace + 'px';
    if (this.spacerBottom) this.spacerBottom.style.height = bottomSpace + 'px';
  }

  /** Force re-render all visible items (e.g. after selection change) */
  refresh() {
    // Remove all rendered items and re-render
    for (const idx of this._rendered) {
      const el = this.container.querySelector(`[data-virtual-idx="${idx}"]`);
      if (el) el.remove();
    }
    this._rendered.clear();
    this._renderVisible();
  }
}

export const VIRTUAL_SCROLL_THRESHOLD = 200;

export function getItemHeight(viewMode) {
  return viewMode === 'grid' ? GRID_ROW_HEIGHT : LIST_ROW_HEIGHT;
}
