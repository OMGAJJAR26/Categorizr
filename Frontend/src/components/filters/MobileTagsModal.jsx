import { X } from "lucide-react";
import { useEffect, useState } from "react";
import {
  TAG_STATUS_GROUPS,
  getEffectiveGroupSelection,
  isGroupAllSelected,
  setGroupToAll,
  toggleGroupOption,
} from "../../utils/tagStatusGroups";

const MobileTagsModal = ({ onClose, selectedTags, updateFilter }) => {
  const [draftTags, setDraftTags] = useState(selectedTags || []);

  useEffect(() => {
    setDraftTags(selectedTags || []);
  }, [selectedTags]);

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

  const handleDone = () => {
    updateFilter("tags", draftTags);
    onClose();
  };

  const activeGroupsCount = TAG_STATUS_GROUPS.filter(
    (group) => !isGroupAllSelected(draftTags, group)
  ).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[1px]">
      <div className="bg-white rounded-2xl w-[92%] max-w-sm max-h-[74vh] overflow-hidden flex flex-col shadow-2xl border border-blue-100">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-gradient-to-r from-blue-50 via-indigo-50 to-white">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-lg text-gray-800">Status Filters</h3>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-semibold">
              {activeGroupsCount} active
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleClearAll}
              className="text-sm text-red-500 hover:text-red-700 font-medium"
            >
              Reset
            </button>
            <button
              onClick={onClose}
              className="p-1 hover:bg-gray-200 rounded-full"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Tags List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2.5 bg-slate-50/40">
          {TAG_STATUS_GROUPS.map((group) => {
            const effectiveSelection = getEffectiveGroupSelection(draftTags, group);
            const allSelected = isGroupAllSelected(draftTags, group);
            return (
              <div
                key={group.key}
                className="bg-white rounded-xl border border-gray-200 px-2.5 py-2 shadow-sm"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-semibold text-gray-700">
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
                    onClick={() => handleAllToggle(group.key)}
                    className={`flex-1 px-2 py-1.5 text-[11px] font-semibold border-r border-gray-200 transition-colors ${
                      allSelected
                        ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white"
                        : "bg-white text-gray-700"
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
                        onClick={() => handleTagToggle(group.key, option.key)}
                        className={`flex-1 px-2 py-1.5 text-[11px] font-semibold transition-colors ${
                          !isLast ? "border-r border-gray-200" : ""
                        } ${
                          isSelected
                            ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white"
                            : "bg-white text-gray-700"
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

        {/* Footer */}
        <div className="border-t p-3 bg-white">
          <button
            onClick={handleDone}
            className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-2 rounded-lg text-sm font-semibold hover:from-blue-700 hover:to-indigo-700 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

export default MobileTagsModal;
