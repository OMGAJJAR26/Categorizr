import { Check } from "lucide-react";

/**
 * Selection checkbox rendered inside a receipt row's data line (so it lines up with the
 * date/content rather than the badge-inclusive card). Renders nothing outside select mode.
 */
const RowSelectCheckbox = ({ selectionMode, isSelected, onToggleSelect, className = "" }) => {
  if (!selectionMode) return null;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggleSelect?.();
      }}
      aria-label={isSelected ? "Deselect receipt" : "Select receipt"}
      aria-pressed={isSelected}
      className={`inline-flex items-center justify-center p-0 h-6 w-6 shrink-0 rounded-md border-2 box-border leading-none transition-colors ${
        isSelected
          ? "bg-blue-600 border-blue-600 text-white"
          : "border-gray-300 text-transparent hover:border-blue-400"
      } ${className}`}
    >
      <Check size={16} strokeWidth={3} className="block" />
    </button>
  );
};

export default RowSelectCheckbox;
