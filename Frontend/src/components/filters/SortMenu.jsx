import { useEffect, useRef } from "react";
import { SortAsc } from "lucide-react";

const SORT_OPTIONS = [
  { key: "order", value: "az", label: "A to Z" },
  { key: "order", value: "za", label: "Z to A" },
  { key: "amount", value: "asc", label: "Lowest Amount" },
  { key: "amount", value: "desc", label: "Highest Amount" },
  { key: "date", value: "newest", label: "Newest First" },
  { key: "date", value: "oldest", label: "Oldest First" },
];

const SortMenu = ({ activeMenu, setActiveMenu, sortConfig, updateSort, iconOnly = false }) => {
  const sortMenuRef = useRef(null);

  // Close menu when clicking/tapping outside (mobile + desktop)
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (sortMenuRef.current && !sortMenuRef.current.contains(event.target)) {
        setActiveMenu(null);
      }
    };

    if (activeMenu === "sort") {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("touchstart", handleClickOutside, { passive: true });
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
        document.removeEventListener("touchstart", handleClickOutside);
      };
    }
  }, [activeMenu, setActiveMenu]);

  const handleSortClick = (type, value) => {
    updateSort(type, value);
    setActiveMenu(null);
  };

  return (
    <div className={`relative ${iconOnly ? "w-auto shrink-0" : "w-full md:w-auto"}`} ref={sortMenuRef}>
      <button
        onMouseDown={(e) => {
          e.stopPropagation();
          if (activeMenu === "option") setActiveMenu(null);
        }}
        onClick={(e) => {
          e.stopPropagation();
          setActiveMenu((prev) => (prev === "sort" ? null : "sort"));
        }}
        title={iconOnly ? "Sort" : undefined}
        className={`flex items-center justify-center border border-blue-500 text-blue-600 font-bold rounded-full ${iconOnly ? "p-2 w-10 h-10 shrink-0" : "gap-x-2 px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm w-full md:w-[135px]"}`}
      >
        <SortAsc size={iconOnly ? 18 : 14} className={iconOnly ? "" : "sm:w-4 sm:h-4"} />
        {!iconOnly && " Sort"}
      </button>

      {activeMenu === "sort" && (
        <div
          className="absolute top-10 sm:top-12 left-0 md:left-auto md:right-0 bg-white text-sm text-gray-700 rounded-lg shadow-lg w-full min-w-[160px] sm:w-40 z-[100] border max-h-[60vh] overflow-y-auto"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <ul className="divide-y divide-gray-200">
            {SORT_OPTIONS.map((option) => (
              <li
                key={`${option.key}-${option.value}`}
                className={`px-3 sm:px-4 py-2.5 sm:py-2 hover:bg-blue-50 cursor-pointer text-sm active:bg-blue-100 ${
                  sortConfig[option.key] === option.value ? "bg-blue-50 font-medium" : ""
                }`}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  handleSortClick(option.key, option.value);
                }}
              >
                {option.label}
                {sortConfig[option.key] === option.value && (
                  <span className="ml-2 text-blue-600">✓</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default SortMenu;