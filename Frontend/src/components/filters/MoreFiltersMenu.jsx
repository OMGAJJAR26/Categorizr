import { useEffect, useRef } from "react";
import { Filter } from "lucide-react";
import { filterReceipts } from "../../utils/receiptFilters";

const TAG_OPTIONS = [
  { key: "verified", label: "Verified" },
  { key: "unverified", label: "Unverified" },
  { key: "starred", label: "Starred" },
  { key: "unstarred", label: "Unstarred" },
  { key: "flagged", label: "Flagged" },
  { key: "unflagged", label: "Unflagged" },
  { key: "locked", label: "Locked" },
  { key: "unlocked", label: "Unlocked" },
  { key: "reconciled", label: "Reconciled" },
  { key: "unreconciled", label: "Unreconciled" },
  { key: "reimbursed", label: "Reimbursement" },
  { key: "unreimbursed", label: "Not Reimbursed" },
  { key: "warrantied", label: "Warrantied" },
  { key: "unwarrantied", label: "Unwarrantied" },
  { key: "unread", label: "Unread" },
  { key: "read", label: "Read" },
  { key: "forwarded", label: "Forwarded" },
  { key: "received", label: "Received" },
];

const MoreFiltersMenu = ({
  activeMenu,
  setActiveMenu,
  selectedTags,
  updateFilter,
}) => {
  const moreFiltersRef = useRef(null);

  // Close menu when clicking/tapping outside (same as Filter and Sort)
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        moreFiltersRef.current &&
        !moreFiltersRef.current.contains(event.target) &&
        activeMenu === "moreFilters"
      ) {
        setActiveMenu(null);
      }
    };

    if (activeMenu === "moreFilters") {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("touchstart", handleClickOutside, { passive: true });
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
        document.removeEventListener("touchstart", handleClickOutside);
      };
    }
  }, [activeMenu, setActiveMenu]);

  const handleTagToggle = (tagKey) => {
    const newTags = selectedTags.includes(tagKey)
      ? selectedTags.filter((tag) => tag !== tagKey)
      : [...selectedTags, tagKey];
    updateFilter("tags", newTags);
  };

  const handleClearAll = () => {
    updateFilter("tags", []);
  };

  return (
    <div className="relative hidden md:block" ref={moreFiltersRef}>
      <button
        onMouseDown={(e) => {
          e.stopPropagation();
          if (activeMenu === "option") setActiveMenu(null);
        }}
        onClick={(e) => {
          e.stopPropagation();
          setActiveMenu((prev) =>
            prev === "moreFilters" ? null : "moreFilters"
          );
        }}
        className="flex items-center justify-center gap-x-2 border border-blue-500 text-blue-600 font-bold px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm w-[130px] sm:w-[150px]"
      >
        <Filter size={14} className="sm:w-4 sm:h-4" /> More Filters
      </button>

      {activeMenu === "moreFilters" && (
        <div
          className="absolute top-10 sm:top-12 right-0 bg-white text-sm text-gray-700 rounded-lg shadow-lg w-56 z-[100] border max-h-[70vh] overflow-hidden flex flex-col"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-4 py-2 border-b whitespace-nowrap">
            <span className="font-semibold">Select Tags</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleClearAll();
              }}
              className="text-xs text-red-500 hover:text-red-700 font-medium"
            >
              Clear All
            </button>
          </div>

          <div className="max-h-60 overflow-y-auto flex-1">
            <ul className="divide-y divide-gray-200">
              {TAG_OPTIONS.map((tag) => (
                <li
                  key={tag.key}
                  className="px-4 py-2 hover:bg-blue-50 cursor-pointer flex items-center justify-between active:bg-blue-100"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    handleTagToggle(tag.key);
                  }}
                >
                  <span className="flex items-center">
                    <span
                      className={`w-4 h-4 border rounded mr-2 flex items-center justify-center ${
                        selectedTags?.includes(tag.key)
                          ? "bg-blue-500 border-blue-500"
                          : "border-gray-300"
                      }`}
                    >
                      {selectedTags?.includes(tag.key) && (
                        <svg
                          className="w-3 h-3 text-white"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={3}
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      )}
                    </span>
                    {tag.label}
                  </span>
                  {selectedTags?.includes(tag.key) && (
                    <span className="text-blue-600 text-xs font-medium">
                      Selected
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <div className="border-t p-3">
            <div className="flex justify-end items-center">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveMenu(null);
                }}
                className="bg-blue-500 text-white px-4 py-1.5 rounded text-sm font-medium hover:bg-blue-600 transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MoreFiltersMenu;
