import { useState, useRef, useEffect } from "react";
import { useCurrency } from "../context/CurrencyContext";

const CurrencySelector = () => {
  const { language, setLanguage, languages, flags, currency } = useCurrency();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const toggleDropdown = () => setOpen((prev) => !prev);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block", fontFamily: "sans-serif" }}>
      {/* Current Selection */}
      <button
        onClick={toggleDropdown}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "8px 14px",
          background: "linear-gradient(90deg, #bfdbfe, #3b82f6)", // light → dark blue
          border: "1px solid #1e40af",
          borderRadius: "12px",
          cursor: "pointer",
          fontSize: "14px",
          fontWeight: "500",
          boxShadow: "0 2px 6px rgba(59,130,246,0.3)",
          transition: "all 0.2s ease-in-out",
          color: "#1e3a8a",
        }}
      >
        <span style={{ fontSize: "18px" }}>{flags[language]}</span>
        <span>{language}</span>
        <span style={{ fontSize: "12px", color: "#1e40af" }}>({currency})</span>
        <span style={{ marginLeft: "auto", fontSize: "12px" }}>{open ? "▲" : "▼"}</span>
      </button>

      {/* Dropdown */}
      {open && (
        <div
          style={{
            position: "absolute",
            top: "110%",
            left: 0,
            background: "#eff6ff", // very light blue
            borderRadius: "12px",
            border: "1px solid #3b82f6",
            boxShadow: "0 8px 20px rgba(59,130,246,0.15)",
            padding: "4px 0",
            width: "200px",
            zIndex: 1000,
            animation: "fadeInScale 0.2s ease",
            overflow: "hidden",
          }}
        >
          {languages.map((lang) => (
            <div
              key={lang}
              onClick={() => {
                setLanguage(lang);
                setOpen(false);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "8px",
                padding: "8px 12px",
                cursor: "pointer",
                fontSize: "14px",
                fontWeight: language === lang ? "600" : "500",
                color: language === lang ? "#1e3a8a" : "#1e40af",
                backgroundColor: "transparent",
                borderRadius: "8px",
                transition: "all 0.15s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "#dbeafe"; // light hover blue
                e.currentTarget.style.transform = "translateX(2px)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.transform = "translateX(0)";
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ fontSize: "18px" }}>{flags[lang]}</span>
                <span>{lang}</span>
              </div>
              <span style={{ fontSize: "12px", color: "#1e3a8a" }}>({currency})</span>
            </div>
          ))}
        </div>
      )}

      <style>
        {`
          @keyframes fadeInScale {
            0% { opacity: 0; transform: scale(0.95); }
            100% { opacity: 1; transform: scale(1); }
          }
        `}
      </style>
    </div>
  );
};

export default CurrencySelector;
