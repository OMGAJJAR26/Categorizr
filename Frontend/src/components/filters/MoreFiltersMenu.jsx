import { useEffect, useRef, useState } from "react";
import { Filter } from "lucide-react";
import {
  TAG_STATUS_GROUPS,
  getEffectiveGroupSelection,
  isGroupAllSelected,
  setGroupToAll,
  toggleGroupOption,
} from "../../utils/tagStatusGroups";

const MoreFiltersMenu = ({
  activeMenu,
  setActiveMenu,
  selectedTags,
  updateFilter,
}) => {
  const moreFiltersRef = useRef(null);
  const [draftTags, setDraftTags] = useState(selectedTags || []);

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

  useEffect(() => {
    if (activeMenu === "moreFilters") {
      setDraftTags(selectedTags || []);
    }
  }, [activeMenu, selectedTags]);

  const handleTagToggle = (groupKey, tagKey) => {
    const newTags = toggleGroupOption(draftTags, groupKey, tagKey);
    setDraftTags(newTags);
  };

  const handleAllToggle = (groupKey) => {
    const newTags = setGroupToAll(draftTags, groupKey);
    setDraftTags(newTags);
  };

  const handleClearAll = () => {
    setDraftTags([]);
  };

  const handleDone = (event) => {
    event.stopPropagation();
    updateFilter("tags", draftTags);
    setActiveMenu(null);
  };

  const activeGroupsCount = TAG_STATUS_GROUPS.filter(
    (group) => !isGroupAllSelected(draftTags, group)
  ).length;

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
          className="absolute top-10 sm:top-12 right-0 bg-white text-sm text-gray-700 rounded-2xl shadow-2xl w-[340px] z-[100] border border-blue-100 max-h-[62vh] overflow-hidden flex flex-col"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b bg-gradient-to-r from-blue-50 via-indigo-50 to-white">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-gray-800">Status Filters</span>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-semibold">
                {activeGroupsCount} active
              </span>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleClearAll();
              }}
              className="text-xs text-red-500 hover:text-red-700 font-medium"
            >
              Reset
            </button>
          </div>

          <div className="overflow-y-auto flex-1 px-3 py-2.5 space-y-2.5 bg-slate-50/40">
            {TAG_STATUS_GROUPS.map((group) => {
              const effectiveSelection = getEffectiveGroupSelection(draftTags, group);
              const allSelected = isGroupAllSelected(draftTags, group);
              return (
                <div
                  key={group.key}
                  className="bg-white rounded-xl border border-gray-200 px-2.5 py-2 shadow-sm"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-[11px] font-semibold text-gray-700">
                      {group.heading}
                    </div>
                    {!allSelected && (
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded-full">
                        Filtered
                      </div>
                    )}
                  </div>
                  <div className="inline-flex w-full rounded-lg border border-gray-200 overflow-hidden">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAllToggle(group.key);
                      }}
                      className={`flex-1 px-2 py-1.5 text-[11px] font-semibold border-r border-gray-200 transition-colors ${
                        allSelected
                          ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white"
                          : "bg-white text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      All
                    </button>
                    {group.options.map((option, index) => {
                      const isSelected = effectiveSelection.includes(option.key);
                      const isLast = index === group.options.length - 1;
                      return (
                        <button
                          key={option.key}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleTagToggle(group.key, option.key);
                          }}
                          className={`flex-1 px-2 py-1.5 text-[11px] font-semibold transition-colors ${
                            !isLast ? "border-r border-gray-200" : ""
                          } ${
                            isSelected
                              ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white"
                              : "bg-white text-gray-700 hover:bg-gray-50"
                          }`}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="border-t p-2.5 bg-white">
            <div className="flex justify-end items-center">
              <button
                onClick={handleDone}
                className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-3.5 py-1.5 rounded-lg text-xs font-semibold hover:from-blue-700 hover:to-indigo-700 transition-colors"
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
