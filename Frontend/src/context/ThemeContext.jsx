// import { createContext, useContext, useState, useEffect } from "react";

// const ThemeContext = createContext();

// export const ThemeProvider = ({ children }) => {
//   const [isDark, setIsDark] = useState(() => {
//     const saved = localStorage.getItem("cat_theme");
//     // default dark — keeps existing look for existing users
//     return saved ? saved === "dark" : true;
//   });

//   // Sync class on <html> so Tailwind dark: variants and .dark {} CSS rules fire
//   useEffect(() => {
//     document.documentElement.classList.toggle("dark", isDark);
//     localStorage.setItem("cat_theme", isDark ? "dark" : "light");
//   }, [isDark]);

//   // Apply immediately on first mount (avoids flash)
//   useEffect(() => {
//     document.documentElement.classList.toggle(
//       "dark",
//       localStorage.getItem("cat_theme") !== "light"
//     );
//   }, []);

//   const toggle = () => setIsDark((v) => !v);

//   return (
//     <ThemeContext.Provider value={{ isDark, toggle }}>
//       {children}
//     </ThemeContext.Provider>
//   );
// };

// export const useTheme = () => useContext(ThemeContext);
