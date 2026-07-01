import { createUiComponents } from "../../components.js";

export function createAdminComponents({ escapeHtml }) {
  const { renderEmptyState } = createUiComponents({ escapeHtml });

  function renderEmptyCard({ icon, title, description, action }) {
    const actionHtml = action
      ? `<div class="mt-3"><button class="btn toolbar-btn" type="button" data-action="${escapeHtml(action.action)}">${escapeHtml(action.label)}</button></div>`
      : "";

    return renderEmptyState(title || "", description || "", icon, false, actionHtml);
  }

  function renderLoadingCard({ icon, title, description }) {
    return renderEmptyState(title || "加载中", description || "", icon, true);
  }

  function renderErrorCard({ icon, error, onRetry }) {
    const retryHtml = onRetry
      ? `<div class="mt-3"><button class="btn toolbar-btn" type="button" data-action="${escapeHtml(onRetry)}">重新加载</button></div>`
      : "";

    return renderEmptyState("", error || "", icon, false, retryHtml);
  }

  function renderSectionCard({ title, description, actions, content }) {
    const actionsHtml = actions
      ? `<div class="btn-row">${actions}</div>`
      : "";

    return `
      <div class="admin-card">
        <div class="section-header">
          <div>
            <h3 class="section-title">${escapeHtml(title)}</h3>
            ${description ? `<p class="section-desc">${escapeHtml(description)}</p>` : ""}
          </div>
          ${actionsHtml}
        </div>
        <div class="section-content">
          ${content}
        </div>
      </div>
    `;
  }

  function renderRefreshButton(action) {
    return `
      <button class="btn toolbar-btn" type="button" data-action="${escapeHtml(action)}">
        刷新
      </button>
    `;
  }

  function renderStatusTag({ label, type }) {
    const typeClass = type ? `tag-${type}` : "";
    return `<span class="toolbar-tag ${typeClass}">${escapeHtml(label)}</span>`;
  }

  function renderCustomSelect({ id, value, options, actionChange, dataKey, className }) {
    const selected = options.find(o => o.value === value) || options[0];
    const uid = id || `cselect-${Math.random().toString(36).slice(2, 8)}`;
    return `
      <div class="cselect ${className || ""}" data-cselect="${uid}"
           data-action-change="${escapeHtml(actionChange || "")}"
           data-key="${escapeHtml(dataKey || "")}">
        <button class="cselect-trigger" type="button" tabindex="0">
          <span class="cselect-value">${escapeHtml(selected?.label || "")}</span>
          <svg class="cselect-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
        </button>
        <div class="cselect-dropdown">
          ${options.map(o => `
            <div class="cselect-option ${o.value === value ? "cselect-active" : ""}"
                 data-value="${escapeHtml(o.value)}">
              ${escapeHtml(o.label)}
            </div>
          `).join("")}
        </div>
      </div>
    `;
  }

  function bindCustomSelects(root) {
    if (!root) return;
    root.querySelectorAll(".cselect").forEach(el => {
      if (el._bound) return;
      el._bound = true;
      const trigger = el.querySelector(".cselect-trigger");
      const dropdown = el.querySelector(".cselect-dropdown");
      if (!trigger || !dropdown) return;

      trigger.addEventListener("click", (e) => {
        e.stopPropagation();
        const wasOpen = el.classList.contains("cselect-open");
        document.querySelectorAll(".cselect.cselect-open").forEach(o => o.classList.remove("cselect-open"));
        if (!wasOpen) el.classList.add("cselect-open");
      });

      dropdown.querySelectorAll(".cselect-option").forEach(opt => {
        opt.addEventListener("click", (e) => {
          e.stopPropagation();
          const val = opt.dataset.value;
          el.querySelectorAll(".cselect-option").forEach(o => o.classList.remove("cselect-active"));
          opt.classList.add("cselect-active");
          trigger.querySelector(".cselect-value").textContent = opt.textContent.trim();
          el.classList.remove("cselect-open");
          el.dataset.value = val;

          const actionChange = el.dataset.actionChange;
          const dataKey = el.dataset.key;
          if (actionChange) {
            el.dispatchEvent(new CustomEvent("cselect-change", {
              bubbles: true,
              detail: { actionChange, key: dataKey, value: val }
            }));
          }
        });
      });
    });

    if (!root._cselectRootBound) {
      root._cselectRootBound = true;
      root.addEventListener("click", () => {
        root.querySelectorAll(".cselect.cselect-open").forEach(o => o.classList.remove("cselect-open"));
      });
    }
  }

  function renderCustomDatePicker({ id, value, placeholder, actionChange, dataKey, className }) {
    const uid = id || `datepicker-${Math.random().toString(36).slice(2, 8)}`;
    const displayValue = value || "";
    return `
      <div class="cdate ${className || ""}" data-cdate="${uid}"
           data-action-change="${escapeHtml(actionChange || "")}"
           data-key="${escapeHtml(dataKey || "")}"
           data-value="${escapeHtml(value || "")}">
        <button class="cdate-trigger" type="button" tabindex="0">
          <span class="cdate-value">${escapeHtml(displayValue || placeholder || "年/月/日")}</span>
          <svg class="cdate-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
            <line x1="16" y1="2" x2="16" y2="6"></line>
            <line x1="8" y1="2" x2="8" y2="6"></line>
            <line x1="3" y1="10" x2="21" y2="10"></line>
          </svg>
        </button>
        <div class="cdate-panel">
          <div class="cdate-header">
            <button class="cdate-nav" type="button" data-dir="-1">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
            </button>
            <span class="cdate-title"></span>
            <button class="cdate-nav" type="button" data-dir="1">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
            </button>
          </div>
          <div class="cdate-weekdays">
            <span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span><span>日</span>
          </div>
          <div class="cdate-days"></div>
          <div class="cdate-footer">
            <button class="cdate-action" type="button" data-action="clear">清除</button>
            <button class="cdate-action" type="button" data-action="today">今天</button>
          </div>
        </div>
      </div>
    `;
  }

  function bindCustomDatePickers(root) {
    if (!root) return;
    root.querySelectorAll(".cdate").forEach(el => {
      if (el._bound) return;
      el._bound = true;
      const trigger = el.querySelector(".cdate-trigger");
      const panel = el.querySelector(".cdate-panel");
      const title = el.querySelector(".cdate-title");
      const daysContainer = el.querySelector(".cdate-days");
      const navBtns = el.querySelectorAll(".cdate-nav");
      const actionBtns = el.querySelectorAll(".cdate-action");
      if (!trigger || !panel || !daysContainer) return;

      let viewDate = el.dataset.value ? new Date(el.dataset.value + "T00:00:00") : new Date();
      if (isNaN(viewDate.getTime())) viewDate = new Date();

      function formatDate(d) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${y}-${m}-${day}`;
      }

      function renderCalendar() {
        const y = viewDate.getFullYear();
        const m = viewDate.getMonth();
        title.textContent = `${y}年${String(m + 1).padStart(2, "0")}月`;
        const firstDay = new Date(y, m, 1);
        const lastDay = new Date(y, m + 1, 0);
        let startWeekday = firstDay.getDay();
        if (startWeekday === 0) startWeekday = 7;
        const totalDays = lastDay.getDate();
        const selectedVal = el.dataset.value;
        const today = formatDate(new Date());
        let html = "";
        for (let i = 1; i < startWeekday; i++) {
          html += `<span class="cdate-day cdate-empty"></span>`;
        }
        for (let d = 1; d <= totalDays; d++) {
          const dateStr = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
          const isToday = dateStr === today;
          const isSelected = dateStr === selectedVal;
          const cls = ["cdate-day"];
          if (isToday) cls.push("cdate-today");
          if (isSelected) cls.push("cdate-selected");
          html += `<span class="${cls.join(" ")}" data-date="${dateStr}">${d}</span>`;
        }
        daysContainer.innerHTML = html;

        daysContainer.querySelectorAll(".cdate-day:not(.cdate-empty)").forEach(dayEl => {
          dayEl.addEventListener("click", (e) => {
            e.stopPropagation();
            const val = dayEl.dataset.date;
            el.dataset.value = val;
            trigger.querySelector(".cdate-value").textContent = val;
            panel.classList.remove("cdate-open");
            const actionChange = el.dataset.actionChange;
            const dataKey = el.dataset.key;
            if (actionChange) {
              el.dispatchEvent(new CustomEvent("cdate-change", {
                bubbles: true,
                detail: { actionChange, key: dataKey, value: val }
              }));
            }
          });
        });
      }

      trigger.addEventListener("click", (e) => {
        e.stopPropagation();
        const wasOpen = panel.classList.contains("cdate-open");
        document.querySelectorAll(".cdate-panel.cdate-open").forEach(p => p.classList.remove("cdate-open"));
        if (!wasOpen) {
          panel.classList.add("cdate-open");
          renderCalendar();
        }
      });

      navBtns.forEach(btn => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const dir = Number(btn.dataset.dir);
          viewDate.setMonth(viewDate.getMonth() + dir);
          renderCalendar();
        });
      });

      actionBtns.forEach(btn => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const action = btn.dataset.action;
          if (action === "clear") {
            el.dataset.value = "";
            trigger.querySelector(".cdate-value").textContent = placeholder || "年/月/日";
            panel.classList.remove("cdate-open");
            const actionChange = el.dataset.actionChange;
            const dataKey = el.dataset.key;
            if (actionChange) {
              el.dispatchEvent(new CustomEvent("cdate-change", {
                bubbles: true,
                detail: { actionChange, key: dataKey, value: "" }
              }));
            }
          } else if (action === "today") {
            const today = formatDate(new Date());
            el.dataset.value = today;
            trigger.querySelector(".cdate-value").textContent = today;
            panel.classList.remove("cdate-open");
            viewDate = new Date();
            const actionChange = el.dataset.actionChange;
            const dataKey = el.dataset.key;
            if (actionChange) {
              el.dispatchEvent(new CustomEvent("cdate-change", {
                bubbles: true,
                detail: { actionChange, key: dataKey, value: today }
              }));
            }
          }
        });
      });
    });

    if (!root._cdateRootBound) {
      root._cdateRootBound = true;
      root.addEventListener("click", () => {
        root.querySelectorAll(".cdate-panel.cdate-open").forEach(p => p.classList.remove("cdate-open"));
      });
    }
  }

  return {
    renderEmptyCard,
    renderLoadingCard,
    renderErrorCard,
    renderSectionCard,
    renderRefreshButton,
    renderStatusTag,
    renderCustomSelect,
    bindCustomSelects,
    renderCustomDatePicker,
    bindCustomDatePickers,
  };
}
