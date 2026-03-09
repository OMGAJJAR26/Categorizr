import {
  createContext,
  useContext,
  useMemo,
  useState,
  useEffect,
} from "react";

const CurrencyContext = createContext();

const DEFAULT_LANGUAGE = "English";

const LANGUAGE_TO_CURRENCY = {
  English: "USD",
  Spanish: "EUR",
  India: "INR",
  Canadian: "CAD",
};

const LANGUAGE_TO_FLAG = {
  English: "🇺🇸",
  Spanish: "🇪🇸",
  India: "🇮🇳",
  Canadian: "🇨🇦",
};

export const CurrencyProvider = ({ children }) => {
  const [language, setLanguage] = useState(DEFAULT_LANGUAGE);

  useEffect(() => {
    const saved = localStorage.getItem("appLanguage");
    if (saved && LANGUAGE_TO_CURRENCY[saved]) {
      setLanguage(saved);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("appLanguage", language);
  }, [language]);

  const currency = LANGUAGE_TO_CURRENCY[language] || "USD";

  const formatCurrency = useMemo(() => {
    return (amount) => {
      const num = Number(amount);
      if (!Number.isFinite(num)) return "—";

      let locale = "en-US";
      switch (language) {
        case "Spanish":
          locale = "es-ES";
          break;
        case "India":
          locale = "hi-IN";
          break;
        case "Canadian":
          locale = "en-CA";
          break;
        default:
          locale = "en-US";
      }

      try {
        return new Intl.NumberFormat(locale, {
          style: "currency",
          currency: currency || "USD",
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(num);
      } catch (_) {
        return num.toLocaleString(locale, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
      }
    };
  }, [currency, language]);

  const getCurrencySymbol = useMemo(() => {
    return () => {
      try {
        const parts = new Intl.NumberFormat(undefined, {
          style: "currency",
          currency,
        }).formatToParts(1);
        const sym = parts.find((p) => p.type === "currency");
        return sym ? sym.value : currency;
      } catch (_) {
        return currency;
      }
    };
  }, [currency]);

  return (
    <CurrencyContext.Provider
      value={{
        language,
        setLanguage,
        currency,
        formatCurrency,
        getCurrencySymbol,
        languages: Object.keys(LANGUAGE_TO_CURRENCY),
        flags: LANGUAGE_TO_FLAG,
      }}
    >
      {children}
    </CurrencyContext.Provider>
  );
};

export const useCurrency = () => useContext(CurrencyContext);
