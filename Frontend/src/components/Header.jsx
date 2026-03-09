import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import FontLogo from "../assets/categorizrFontLogo.png";
import { UserCircle, Check } from "lucide-react";
import { useData } from "../context/DataContext";
import { useCurrency } from "../context/CurrencyContext";
import LogoutConfirmationDialog from "./LogoutConfirmationDialog";

const Header = () => {
  const navigate = useNavigate();
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showLangMenu, setShowLangMenu] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const langRef = useRef(null);
  const profileRef = useRef(null);
  const { clearAllData, user } = useData();
  const { language, setLanguage, languages, flags } = useCurrency();

  const handleLogout = () => {
    setShowProfileMenu(false);
    setShowLogoutConfirm(false);
    // Clear all data first
    clearAllData();
    // Then clear localStorage
    localStorage.clear();
    // Navigate to login
    navigate("/login", { replace: true });
  };

  const handleLogoutClick = () => {
    setShowLogoutConfirm(true);
  };

  // Close menus when clicking outside either menu, or pressing Escape
  useEffect(() => {
    const handleClickOutside = (event) => {
      const inLang = langRef.current?.contains(event.target);
      const inProfile = profileRef.current?.contains(event.target);
      if (!inLang) setShowLangMenu(false);
      if (!inProfile) setShowProfileMenu(false);
    };

    const handleKey = (e) => {
      if (e.key === "Escape") {
        setShowLangMenu(false);
        setShowProfileMenu(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKey);
    };
  }, []);

  return (
    <header className="sticky top-0 z-50 bg-[#0f172a] text-white px-3 sm:px-4 md:px-6 py-2 sm:py-3 flex items-center justify-between shadow-lg shadow-blue-900/20">
      {/* Logo */}
      <div className="flex items-center">
        <img
          src={FontLogo}
          alt="Categorizr Logo"
          className="h-6 sm:h-7 md:h-8 w-auto object-contain"
        />
      </div>

      <div className="flex items-center gap-2 sm:gap-3 md:gap-4 relative">
        {/* Language Selector */}
        <div className="relative" ref={langRef}>
          <button
            onClick={() => {
              setShowLangMenu((v) => !v);
              setShowProfileMenu(false);
            }}
            className="flex items-center gap-1 sm:gap-2 bg-gradient-to-r from-blue-500 to-blue-700 text-white px-2 sm:px-3 md:px-5 py-1.5 sm:py-2 rounded-full shadow-md shadow-blue-500/30 hover:shadow-lg hover:shadow-blue-500/40 transition-all duration-200"
          >
            <span className="text-sm sm:text-base lg:text-xl leading-none relative -top-0.5">
              {flags[language]}
            </span>
            <span className="font-semibold capitalize leading-none text-xs sm:text-sm md:text-base hidden xs:inline">
              {language}
            </span>
          </button>

          {showLangMenu && (
            <div className="absolute right-0 mt-2 bg-blue-50 text-black rounded-xl shadow-2xl w-48 sm:w-60 z-50 border overflow-hidden animate-fadeIn">
              {languages.map((lang) => (
                <button
                  key={lang}
                  onClick={() => {
                    setLanguage(lang);
                    setShowLangMenu(false);
                  }}
                  className="flex items-center justify-between gap-2 sm:gap-3 w-full text-left px-3 sm:px-5 py-2.5 sm:py-3 m-0 transition-all hover:bg-gradient-to-r hover:from-blue-400 hover:to-blue-600 hover:text-white"
                >
                  <div className="flex items-center gap-2 sm:gap-3">
                    <span className="text-sm sm:text-base lg:text-xl leading-none relative -top-0.5">
                      {flags[lang]}
                    </span>
                    <span className="font-medium capitalize text-sm sm:text-base">
                      {lang}
                    </span>
                  </div>
                  {lang === language && <Check size={18} />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Profile Icon */}
        <div ref={profileRef} className="flex items-center gap-2">
          {/* Username */}

          {/* Profile Icon */}
          <UserCircle
            size={28}
            className="cursor-pointer hover:text-blue-300 transition-colors sm:w-8 sm:h-8 md:w-9 md:h-9 focus:outline-none"
            onClick={() => {
              setShowProfileMenu((v) => !v);
              setShowLangMenu(false);
            }}
          />
          <span className="text-white text-xs sm:text-sm md:text-base font-semibold hidden sm:block">
            {user?.userName || user?.username || user?.email || "User"}
          </span>
          {showProfileMenu && (
  <div className="absolute top-12 sm:top-14 md:top-16 right-0 mt-1 bg-white text-black rounded-xl sm:rounded-2xl shadow-lg w-44 sm:w-52 z-50 border overflow-hidden animate-fadeIn">

    <button
      onClick={handleLogoutClick}
      className="flex items-center w-full text-left px-4 py-3 hover:bg-gray-100 transition-all duration-200 ease-in-out group"
    >
      {/* Logout Icon */}
      <svg
        className="w-5 h-5 mr-2 text-gray-600 group-hover:text-red-500 transition-colors duration-200"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
        />
      </svg>

      {/* Username */}
      <span className="text-sm font-semibold text-gray-800 truncate flex-1">
        {user?.userName || user?.username || user?.email || "User"}
      </span>

      {/* Logout Text */}
      <span className="text-sm font-semibold text-gray-700 group-hover:text-red-600 transition-colors duration-200">
        Logout
      </span>
    </button>
  </div>
)}

        </div>
      </div>
      <LogoutConfirmationDialog
        isOpen={showLogoutConfirm}
        onClose={() => setShowLogoutConfirm(false)}
        onConfirm={handleLogout}
      />
    </header>
  );
};

export default Header;
