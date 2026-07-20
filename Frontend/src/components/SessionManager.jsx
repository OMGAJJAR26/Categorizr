// src/components/SessionManager.jsx
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { clearAuthLocalStorage } from "../utils/authStorage";

const SessionManager = ({ children }) => {
  const navigate = useNavigate();

  useEffect(() => {
    const TIMEOUT = 30 * 60 * 1000;

    let timeoutId;
    const resetTimer = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
    
        clearAuthLocalStorage();
        window.dispatchEvent(new CustomEvent("cat:session-expired"));
        navigate("/login");
      }, TIMEOUT);
    };

    const activityEvents = [
      "mousemove",
      "keydown",
      "click",
      "scroll",
      "touchstart",
    ];

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") resetTimer();
    };

    activityEvents.forEach((event) =>
      window.addEventListener(event, resetTimer)
    );
    document.addEventListener("visibilitychange", handleVisibilityChange);

    resetTimer();

    return () => {
      clearTimeout(timeoutId);
      activityEvents.forEach((event) =>
        window.removeEventListener(event, resetTimer)
      );
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [navigate]);

  return children;
};

export default SessionManager;
