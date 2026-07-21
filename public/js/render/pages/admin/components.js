import { createUiComponents } from "../../components.js";

export function createAdminComponents({ escapeHtml }) {
  const { renderEmptyState, renderBadge } = createUiComponents({ escapeHtml });

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

  function renderCustomSelect({ id, value, options, actionChange, dataKey, className, ariaLabel = "" }) {
    const selected = options.find(o => o.value === value) || options[0];
    const uid = id || `cselect-${Math.random().toString(36).slice(2, 8)}`;
    return `
      <div class="cselect ${className || ""}" data-cselect="${uid}"
           data-action-change="${escapeHtml(actionChange || "")}"
           data-key="${escapeHtml(dataKey || "")}">
        <button class="cselect-trigger" type="button" aria-label="${escapeHtml(ariaLabel || "选择选项")}" aria-haspopup="listbox" aria-expanded="false" aria-controls="${escapeHtml(uid)}-listbox">
          <span class="cselect-value">${escapeHtml(selected?.label || "")}</span>
          <svg class="cselect-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"></polyline></svg>
        </button>
        <div class="cselect-dropdown" id="${escapeHtml(uid)}-listbox" role="listbox">
          ${options.map(o => `
            <div class="cselect-option ${o.value === value ? "cselect-active" : ""}"
                 data-value="${escapeHtml(o.value)}" role="option" aria-selected="${o.value === value}" tabindex="-1">
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

      const optionElements = Array.from(dropdown.querySelectorAll(".cselect-option"));
      const setOpen = (open, focusOption = false) => {
        el.classList.toggle("cselect-open", open);
        trigger.setAttribute("aria-expanded", String(open));
        if (open && focusOption) {
          const active = el.querySelector(".cselect-option.cselect-active") || optionElements[0];
          active?.focus();
        }
      };
      const selectOption = (opt) => {
        const val = opt.dataset.value;
        optionElements.forEach(o => {
          const active = o === opt;
          o.classList.toggle("cselect-active", active);
          o.setAttribute("aria-selected", String(active));
        });
        trigger.querySelector(".cselect-value").textContent = opt.textContent.trim();
        setOpen(false);
        el.dataset.value = val;
        const inputName = el.dataset.inputName;
        if (inputName) {
          const form = el.closest("form");
          const scope = form || el.parentElement || root;
          const hiddenInput = Array.from(scope.querySelectorAll('input[type="hidden"]'))
            .find(input => input.name === inputName);
          if (hiddenInput) hiddenInput.value = val;
        }
        const actionChange = el.dataset.actionChange;
        const dataKey = el.dataset.key;
        if (actionChange) {
          el.dispatchEvent(new CustomEvent("cselect-change", {
            bubbles: true,
            detail: { actionChange, key: dataKey, value: val }
          }));
        }
      };

      trigger.addEventListener("click", (e) => {
        e.stopPropagation();
        const wasOpen = el.classList.contains("cselect-open");
        document.querySelectorAll(".cselect.cselect-open").forEach(o => {
          o.classList.remove("cselect-open");
          o.querySelector(".cselect-trigger")?.setAttribute("aria-expanded", "false");
        });
        setOpen(!wasOpen);
      });

      trigger.addEventListener("keydown", (event) => {
        if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
          event.preventDefault();
          setOpen(true, true);
        } else if (event.key === "Escape" && el.classList.contains("cselect-open")) {
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
        }
      });

      optionElements.forEach(opt => {
        opt.addEventListener("click", (e) => {
          e.stopPropagation();
          selectOption(opt);
        });
        opt.addEventListener("keydown", (event) => {
          const index = optionElements.indexOf(opt);
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            const delta = event.key === "ArrowDown" ? 1 : -1;
            optionElements[(index + delta + optionElements.length) % optionElements.length]?.focus();
          } else if (event.key === "Home" || event.key === "End") {
            event.preventDefault();
            optionElements[event.key === "Home" ? 0 : optionElements.length - 1]?.focus();
          } else if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            selectOption(opt);
            trigger.focus();
          } else if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            setOpen(false);
            trigger.focus();
          } else if (event.key === "Tab") {
            setOpen(false);
          }
        });
      });
    });

    if (!root._cselectRootBound) {
      root._cselectRootBound = true;
      root.addEventListener("click", () => {
        root.querySelectorAll(".cselect.cselect-open").forEach(o => {
          o.classList.remove("cselect-open");
          o.querySelector(".cselect-trigger")?.setAttribute("aria-expanded", "false");
        });
      });
    }
  }

  function renderCustomDatePicker({ id, value, placeholder, actionChange, dataKey, className, ariaLabel = "" }) {
    const uid = id || `datepicker-${Math.random().toString(36).slice(2, 8)}`;
    const displayValue = value || "";
    const accessibleLabel = ariaLabel || placeholder || "选择日期";
    return `
      <div class="cdate ${className || ""}" data-cdate="${uid}"
           data-action-change="${escapeHtml(actionChange || "")}"
           data-key="${escapeHtml(dataKey || "")}"
           data-value="${escapeHtml(value || "")}">
        <button class="cdate-trigger" type="button" aria-label="${escapeHtml(accessibleLabel)}" aria-haspopup="dialog" aria-expanded="false" aria-controls="${escapeHtml(uid)}-panel">
          <span class="cdate-value">${escapeHtml(displayValue || placeholder || "年/月/日")}</span>
          <svg class="cdate-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
            <line x1="16" y1="2" x2="16" y2="6"></line>
            <line x1="8" y1="2" x2="8" y2="6"></line>
            <line x1="3" y1="10" x2="21" y2="10"></line>
          </svg>
        </button>
        <div class="cdate-panel" id="${escapeHtml(uid)}-panel" role="dialog" aria-label="${escapeHtml(accessibleLabel)}">
          <div class="cdate-header">
            <button class="cdate-nav" type="button" data-dir="-1" aria-label="上个月">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"></polyline></svg>
            </button>
            <span class="cdate-title" aria-live="polite"></span>
            <button class="cdate-nav" type="button" data-dir="1" aria-label="下个月">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"></polyline></svg>
            </button>
          </div>
          <div class="cdate-weekdays" aria-hidden="true">
            <span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span><span>日</span>
          </div>
          <div class="cdate-days" role="group" aria-label="日期"></div>
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

      function setOpen(open, focusDate = false) {
        panel.classList.toggle("cdate-open", open);
        trigger.setAttribute("aria-expanded", String(open));
        if (open && focusDate) {
          daysContainer.querySelector(".cdate-selected, .cdate-today, .cdate-day")?.focus();
        }
      }

      function selectDate(value) {
        el.dataset.value = value;
        trigger.querySelector(".cdate-value").textContent = value || placeholder || "年/月/日";
        setOpen(false);
        const actionChange = el.dataset.actionChange;
        const dataKey = el.dataset.key;
        if (actionChange) {
          el.dispatchEvent(new CustomEvent("cdate-change", {
            bubbles: true,
            detail: { actionChange, key: dataKey, value }
          }));
        }
        trigger.focus();
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
          html += `<span class="cdate-day cdate-empty" aria-hidden="true"></span>`;
        }
        for (let d = 1; d <= totalDays; d++) {
          const dateStr = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
          const isToday = dateStr === today;
          const isSelected = dateStr === selectedVal;
          const cls = ["cdate-day"];
          if (isToday) cls.push("cdate-today");
          if (isSelected) cls.push("cdate-selected");
          const currentAttr = isToday ? ` aria-current="date"` : "";
          html += `<button class="${cls.join(" ")}" type="button" data-date="${dateStr}" aria-label="${dateStr}" aria-pressed="${isSelected}"${currentAttr}>${d}</button>`;
        }
        daysContainer.innerHTML = html;

        daysContainer.querySelectorAll(".cdate-day:not(.cdate-empty)").forEach(dayEl => {
          dayEl.addEventListener("click", (e) => {
            e.stopPropagation();
            selectDate(dayEl.dataset.date);
          });
        });
      }

      trigger.addEventListener("click", (e) => {
        e.stopPropagation();
        const wasOpen = panel.classList.contains("cdate-open");
        document.querySelectorAll(".cdate-panel.cdate-open").forEach(p => {
          p.classList.remove("cdate-open");
          p.closest(".cdate")?.querySelector(".cdate-trigger")?.setAttribute("aria-expanded", "false");
        });
        if (!wasOpen) {
          renderCalendar();
          setOpen(true, true);
        }
      });

      panel.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
          trigger.focus();
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
            selectDate("");
          } else if (action === "today") {
            const today = formatDate(new Date());
            viewDate = new Date();
            selectDate(today);
          }
        });
      });
    });

    if (!root._cdateRootBound) {
      root._cdateRootBound = true;
      root.addEventListener("click", () => {
        root.querySelectorAll(".cdate-panel.cdate-open").forEach(p => {
          p.classList.remove("cdate-open");
          p.closest(".cdate")?.querySelector(".cdate-trigger")?.setAttribute("aria-expanded", "false");
        });
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
    renderBadge,
    renderCustomSelect,
    bindCustomSelects,
    renderCustomDatePicker,
    bindCustomDatePickers,
  };
}
