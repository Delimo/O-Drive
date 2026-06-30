export function createNotificationPolling({ documentRef, intervalMs = 30000 }) {
  let pollTimer = null;
  let abortController = null;

  function clearPollTimer() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function stop() {
    clearPollTimer();
    if (abortController) {
      abortController.abort();
      abortController = null;
    }
  }

  function start(store, thunks) {
    stop();
    abortController = new AbortController();

    function poll() {
      store.dispatch(thunks.loadNotifications());
    }

    pollTimer = setInterval(poll, intervalMs);
    documentRef.addEventListener(
      "visibilitychange",
      () => {
        if (documentRef.hidden) {
          clearPollTimer();
        } else if (!pollTimer) {
          pollTimer = setInterval(poll, intervalMs);
        }
      },
      { signal: abortController.signal },
    );
  }

  return { start, stop };
}
