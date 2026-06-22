export function registerNavigationActions(documentRef, windowRef, store, actions, thunks) {
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

    if (action === "toggle-theme") {
      const root = document.documentElement;
      const stored = localStorage.getItem("theme");
      if (!stored) {
        const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
        root.setAttribute("data-theme", next);
        try { localStorage.setItem("theme", next); } catch (_) {}
      } else if (stored === "light") {
        root.setAttribute("data-theme", "dark");
        try { localStorage.setItem("theme", "dark"); } catch (_) {}
      } else {
        try { localStorage.removeItem("theme"); } catch (_) {}
        const prefersDark = windowRef.matchMedia("(prefers-color-scheme: dark)").matches;
        root.setAttribute("data-theme", prefersDark ? "dark" : "light");
      }
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
