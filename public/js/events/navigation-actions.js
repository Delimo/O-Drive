export function registerNavigationActions(documentRef, windowRef, store, actions, thunks, dispatchToast, copyText) {
  return (event) => {
    const actionNode = event.target.closest("[data-action]");
    if (!actionNode) return;

    const { action } = actionNode.dataset;

    if (action === "open-login") {
      store.dispatch(actions.app.setModal({ type: "login", loading: false, error: "", values: {} }));
      return;
    }

    if (action === "close-modal" || action === "close-modal-backdrop") {
      const stopClose = event.target.closest('[data-stop-close="true"]');
      if (action === "close-modal-backdrop" && stopClose) return;
      store.dispatch(actions.app.setModal(null));
      return;
    }

    if (action === "logout") {
      store.dispatch(thunks.logout());
      return;
    }

    if (action === "copy-current-url") {
      copyText(windowRef.location.href, "当前链接已复制");
      return;
    }

    if (action === "toggle-theme") {
      const root = document.documentElement;
      const stored = localStorage.getItem("theme");
      const current = root.getAttribute("data-theme");
      let nextStored, nextTheme;
      if (stored === "light" || (!stored && current === "light")) {
        nextStored = "dark";
        nextTheme = "dark";
      } else if (stored === "dark" || (!stored && current === "dark")) {
        nextStored = "system";
        nextTheme = null;
      } else {
        nextStored = "light";
        nextTheme = "light";
      }
      if (nextTheme) {
        root.setAttribute("data-theme", nextTheme);
      } else {
        root.removeAttribute("data-theme");
      }
      try { localStorage.setItem("theme", nextStored); } catch (_) {}
      return;
    }

    if (action === "toggle-notifications") {
      const current = store.getState().admin.notifOpen;
      store.dispatch(actions.admin.setNotifOpen(!current));
      if (!current) store.dispatch(thunks.loadNotifications());
      return;
    }

    if (action === "mark-notification-read") {
      const id = actionNode.dataset.notifId;
      if (id) store.dispatch(thunks.markNotificationRead(Number(id)));
      return;
    }

    if (action === "mark-all-notifications-read") {
      store.dispatch(thunks.markAllNotificationsRead());
      return;
    }

    if (action === "open-folder-modal") {
      const state = store.getState();
      if (state.app.role !== "admin") {
        dispatchToast("error", "请先登录管理员账户");
        return;
      }
      store.dispatch(actions.app.setModal({ type: "folder", loading: false, error: "", values: {} }));
      return;
    }
  };
}
