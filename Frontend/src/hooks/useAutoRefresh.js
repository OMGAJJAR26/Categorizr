import { useEffect, useRef } from "react";

// How often the home page quietly re-checks for new receipts while it is on screen.
// This used to be 4 seconds, which re-downloaded five lists every 4 seconds per open tab.
export const AUTO_REFRESH_INTERVAL_MS = 20000;

// Runs `refresh` on a timer, plus immediately when the tab regains focus or becomes
// visible. A tick is skipped while the tab is hidden, the browser is offline, or the
// previous refresh is still running, so requests never pile up.
export function useAutoRefresh(refresh, { enabled = true, intervalMs = AUTO_REFRESH_INTERVAL_MS } = {}) {
  const refreshRef = useRef(refresh);
  const inFlightRef = useRef(false);

  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    if (!enabled) return undefined;

    let stopped = false;
    const run = async () => {
      if (stopped || document.hidden || navigator.onLine === false || inFlightRef.current) return;
      inFlightRef.current = true;
      try {
        await refreshRef.current();
      } catch (e) {
        // Keep this non-blocking; a manual refresh still works.
        console.error("Auto refresh failed:", e);
      } finally {
        inFlightRef.current = false;
      }
    };

    const intervalId = window.setInterval(run, intervalMs);
    window.addEventListener("focus", run);
    document.addEventListener("visibilitychange", run);

    return () => {
      stopped = true;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", run);
      document.removeEventListener("visibilitychange", run);
    };
  }, [enabled, intervalMs]);
}
