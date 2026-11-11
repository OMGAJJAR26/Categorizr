import { createContext, useContext, useEffect } from "react";

const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
  // Dark mode removed — app is always light.
  useEffect(() => {
    document.documentElement.classList.remove("dark");
    localStorage.removeItem("cat_theme");
  }, []);

  return (
    <ThemeContext.Provider value={{ isDark: false, toggle: () => {} }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
