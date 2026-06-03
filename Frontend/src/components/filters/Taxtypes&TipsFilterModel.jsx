import { useState, useEffect, useRef, useMemo } from "react";
import { useData } from "../../context/DataContext";
import { toTaxLabel } from "../../utils/receiptFormatters";

const TaxtypesAndTipsFilterModel = ({
  onClose,
  onApply,
  initialSelected = [], // Fixed typo: was 'intialSelected'
}) => {
  const { receiptTaxValues, taxData } = useData();
  const modalRef = useRef(null);

  // Close modal when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (modalRef.current && !modalRef.current.contains(event.target)) {
        onClose();
      }
    };

    // Add slight delay to prevent immediate close on open
    const timeoutId = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [onClose]);

  const labels = useMemo(() => {
    // Combine taxData from API with receiptTaxValues
    const taxMap = new Map();
    
    // Add taxes from taxData API (saved tax types)
    if (Array.isArray(taxData)) {
      taxData.forEach((tax) => {
        const name = (tax.tax_name || "").toString().trim();
        const rate = (tax.tax_rate || "").toString().trim();
        if (name && rate) {
          const key = `${name}|${rate}`;
          if (!taxMap.has(key)) {
            taxMap.set(key, tax);
          }
        }
      });
    }
    
    // Also include taxes from receiptTaxValues for backward compatibility
    if (Array.isArray(receiptTaxValues)) {
      receiptTaxValues.forEach((tax) => {
        const name = (tax.tax_name || "").toString().trim();
        const rate = (tax.tax_rate || "").toString().trim();
        if (name && rate) {
          const key = `${name}|${rate}`;
          if (!taxMap.has(key)) {
            taxMap.set(key, tax);
          }
        }
      });
    }
    
    const allTaxes = Array.from(taxMap.values());
    const unique = new Set(allTaxes.map(toTaxLabel));
    const items = Array.from(unique).sort((a, b) => a.localeCompare(b));
    const tips = items.filter((i) => i.toLowerCase().startsWith("tip"));
    const rest = items.filter((i) => !i.toLowerCase().startsWith("tip"));
    return [...rest, ...tips];
  }, [receiptTaxValues, taxData]);

  const [selectedTaxAndTipsTypes, setSelectedTaxAndTipsTypes] =
    useState(initialSelected);

  useEffect(() => {
    setSelectedTaxAndTipsTypes(initialSelected || []);
  }, [initialSelected]);

  const toggleTaxAndTips = (label) => {
    setSelectedTaxAndTipsTypes((prev) =>
      prev.includes(label) ? prev.filter((t) => t !== label) : [...prev, label]
    );
  };

  const handleApply = () => {
    localStorage.setItem(
      "selectedTaxAndTipsTypes",
      JSON.stringify(selectedTaxAndTipsTypes)
    );
    onApply(selectedTaxAndTipsTypes);
    onClose();
  };

  const handleClearAll = () => {
    setSelectedTaxAndTipsTypes([]);
    localStorage.removeItem("selectedTaxAndTipsTypes");
  };

  const handleSelectAll = () => {
    setSelectedTaxAndTipsTypes(labels);
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-30 z-50 p-4">
      <div
        ref={modalRef}
        className="bg-white rounded-lg shadow-lg p-4 sm:p-6 w-full max-w-[22rem]"
        onClick={(e) => {
          // Prevent clicks inside modal from closing it
          e.stopPropagation();
        }}
      >
        <h2 className="text-lg font-semibold mb-4">Select Tax Types & Tip</h2>

        <div className="max-h-48 overflow-y-auto">
          {labels.length === 0 ? (
            <div className="text-sm text-gray-500 py-2">No tax types found</div>
          ) : (
            labels.map((label) => (
              <label
                key={label}
                className="flex items-center space-x-2 mb-2 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selectedTaxAndTipsTypes.includes(label)}
                  onChange={() => toggleTaxAndTips(label)}
                  style={{ width: "auto" }}
                />
                <span>{label}</span>
              </label>
            ))
          )}
        </div>

        <div className="mt-4 grid grid-cols-[repeat(2,1fr)] gap-2.5">
          <button
            onClick={onClose}
            className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 m-0"
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 m-0"
          >
            Apply
          </button>
          <button
            onClick={handleSelectAll}
            className="px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600 m-0"
          >
            Select All
          </button>
          <button
            onClick={handleClearAll}
            className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 m-0"
          >
            Clear All
          </button>
        </div>
      </div>
    </div>
  );
};

export default TaxtypesAndTipsFilterModel;
