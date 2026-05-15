import { useCallback, useEffect, useRef, useState } from "react";

export const TAX_RATE_LIMIT_ALERT_MS = 4500;

export function useTaxRateLimitAlert() {
  const [message, setMessage] = useState(null);
  const timerRef = useRef(null);

  const showAlert = useCallback((text) => {
    if (!text) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    setMessage(text);
    timerRef.current = setTimeout(() => {
      setMessage(null);
      timerRef.current = null;
    }, TAX_RATE_LIMIT_ALERT_MS);
  }, []);

  const clearAlert = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    setMessage(null);
  }, []);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  return { message, showAlert, clearAlert };
}
