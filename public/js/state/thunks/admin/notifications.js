import { assertApiOk } from "../errors.js";

let _audioCtx;

function showNotificationAlert(message) {
  try {
    const ctx =
      _audioCtx ||
      (_audioCtx = new (window.AudioContext || window.webkitAudioContext)());
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(660, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);
  } catch (err) { console.error("AudioContext 错误:", err); }
  try {
    if (typeof Notification === "undefined") return;
    if (Notification.permission === "granted") {
      new Notification("O-Drive 通知", { body: message, icon: "/favicon.ico" });
    } else if (Notification.permission !== "denied") {
      Notification.requestPermission();
    }
  } catch (err) { console.error("Notification 错误:", err); }
}

export function cleanupAudioContext() {
  if (_audioCtx && _audioCtx.state !== "closed") {
    _audioCtx.close().catch(() => {});
    _audioCtx = null;
  }
}

export function createAdminNotificationThunks({
  actions,
  notificationApi,
  humanError,
  mock,
  getMockModule,
  getThunks,
}) {
  return {
    loadNotifications: () => async (dispatch, getState) => {
      dispatch(actions.admin.setNotificationsLoading(true));
      if (mock) {
        const m = await getMockModule();
        const unread = m.mockNotifications.filter((n) => !n.read).length;
        dispatch(
          actions.admin.setNotifications({
            items: m.mockNotifications,
            unread,
          }),
        );
        return;
      }
      try {
        const { response, data } = await notificationApi.list(20);
        assertApiOk(response, data, "通知列表加载失败", humanError);
        const state = getState();
        const oldIds = state.admin.lastNotifIds;
        const newIds = (data.items || []).map((n) => n.id);
        if (state.admin.notifInitialized && newIds.length && oldIds.length) {
          const newUnread = (data.items || []).filter(
            (n) => !n.read && !oldIds.includes(n.id),
          );
          newUnread.forEach((n) => showNotificationAlert(n.message));
        }
        dispatch(actions.admin.setNotifications(data));
        dispatch(actions.admin.setLastNotifIds(newIds));
        if (!state.admin.notifInitialized) {
          dispatch(actions.admin.setNotifInitialized(true));
        }
      } catch (_) {
        dispatch(actions.admin.setNotificationsLoading(false));
      }
    },

    markNotificationRead: (id) => async (dispatch) => {
      if (mock) {
        const m = await getMockModule();
        dispatch(
          actions.admin.setNotificationsUnread(
            Math.max(0, m.mockNotifications.filter((n) => !n.read).length - 1),
          ),
        );
        return;
      }
      try {
        await notificationApi.markRead(id);
        await dispatch(getThunks().loadNotifications());
      } catch (err) { console.error("markNotificationRead 错误:", err); }
    },

    markAllNotificationsRead: () => async (dispatch) => {
      if (mock) {
        dispatch(actions.admin.setNotificationsUnread(0));
        return;
      }
      try {
        await notificationApi.markAllRead();
        await dispatch(getThunks().loadNotifications());
      } catch (err) { console.error("markAllNotificationsRead 错误:", err); }
    },

    loadAdminNotifications: () => async (dispatch, getState) => {
      dispatch(actions.admin.setAdminNotifHistoryLoading(true));
      if (mock) {
        const m = await getMockModule();
        const filter = getState().admin.adminNotifFilter || {};
        const items = m.mockNotifications.filter((item) => {
          if (filter.severity && filter.severity !== "all" && item.severity !== filter.severity) return false;
          if (filter.read === "read" && !item.read) return false;
          if (filter.read === "unread" && item.read) return false;
          return true;
        });
        dispatch(
          actions.admin.setAdminNotifHistory({
            items,
            unread: m.mockNotifications.filter((n) => !n.read).length,
          }),
        );
        return;
      }
      try {
        const filter = getState().admin.adminNotifFilter || {};
        const { response, data } = await notificationApi.list(50, filter);
        assertApiOk(response, data, "通知历史加载失败", humanError);
        dispatch(actions.admin.setAdminNotifHistory(data));
      } catch (err) {
        console.error("loadAdminNotifications 错误:", err);
        dispatch(actions.admin.setAdminNotifHistoryLoading(false));
      }
    },
  };
}
