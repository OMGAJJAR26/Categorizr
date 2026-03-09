import { X } from "lucide-react";

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

const MobileTagsModal = ({ onClose, selectedTags, updateFilter }) => {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl w-[90%] max-w-md max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
          <h3 className="font-semibold text-lg">Select Tags</h3>
          <div className="flex items-center gap-3">
            <button
              onClick={handleClearAll}
              className="text-sm text-red-500 hover:text-red-700 font-medium"
            >
              Clear All
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
        <div className="flex-1 overflow-y-auto">
          <ul className="divide-y divide-gray-200">
            {TAG_OPTIONS.map((tag) => (
              <li
                key={tag.key}
                className="px-4 py-3 hover:bg-blue-50 cursor-pointer flex items-center justify-between"
                onClick={() => handleTagToggle(tag.key)}
              >
                <span className="flex items-center">
                  <span
                    className={`w-5 h-5 border rounded mr-3 flex items-center justify-center ${
                      selectedTags.includes(tag.key)
                        ? "bg-blue-500 border-blue-500"
                        : "border-gray-300"
                    }`}
                  >
                    {selectedTags.includes(tag.key) && (
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
                {selectedTags.includes(tag.key) && (
                  <span className="text-blue-600 text-xs font-medium">
                    Selected
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>

        {/* Footer */}
        <div className="border-t p-4 bg-gray-50">
          <button
            onClick={onClose}
            className="w-full bg-blue-500 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-blue-600 transition-colors"
          >
            Done ({selectedTags.length} selected)
          </button>
        </div>
      </div>
    </div>
  );
};

export default MobileTagsModal;
