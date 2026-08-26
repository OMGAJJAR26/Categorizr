import { createContext, useContext, useState, useEffect } from "react";

const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem("cat_theme");
    return saved ? saved === "dark" : false;
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
    localStorage.setItem("cat_theme", isDark ? "dark" : "light");
  }, [isDark]);

  // Apply immediately on first mount to avoid flash of wrong theme
  useEffect(() => {
    const saved = localStorage.getItem("cat_theme");
    document.documentElement.classList.toggle("dark", saved === "dark");
  }, []);

  const toggle = () => {
    // Add transitioning class for the 250ms animation window, then remove it
    document.documentElement.classList.add("theme-switching");
    setIsDark((v) => !v);
    setTimeout(() => {
      document.documentElement.classList.remove("theme-switching");
    }, 250);
  };

  return (
    <ThemeContext.Provider value={{ isDark, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
