import { useState, useEffect } from "react";
import { DateRange } from "react-date-range";
import "react-date-range/dist/styles.css";
import "react-date-range/dist/theme/default.css";

const DateFilterModal = ({ onApply, onClose }) => {
  const [range, setRange] = useState([
    {
      startDate: new Date(),
      endDate: new Date(),
      key: "selection",
    },
  ]);

  const [isCleared, setIsCleared] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("dateRange");
    if (saved) {
      const parsed = JSON.parse(saved);
      setRange([
        {
          startDate: new Date(parsed.startDate),
          endDate: new Date(parsed.endDate),
          key: "selection",
        },
      ]);
      setIsCleared(false);
    }
  }, []);

  const handleApply = () => {
    if (isCleared) {
      onApply(null);
      onClose();
      return;
    }
    const selectedRange = range[0];
    localStorage.setItem("dateRange", JSON.stringify(selectedRange));
    onApply(selectedRange);
    onClose();
  };

  const handleClearAll = () => {
    setIsCleared(true);
    setRange([
      {
        startDate: new Date(),
        endDate: new Date(),
        key: "selection",
      },
    ]);
    localStorage.removeItem("dateRange");
    onApply(null);
  };

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="fixed inset-0 bg-black/30 backdrop-blur-sm flex justify-center items-center z-50 p-4"
    >
      <div className="bg-white rounded-xl shadow-lg p-3 sm:p-4 w-full max-w-[360px] max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold mb-3 text-gray-700 text-center">
          Select Date Range
        </h2>

        <div className="flex flex-col items-center">
          <DateRange
            editableDateInputs={true}
            onChange={(item) => {
              setRange([item.selection]);
              setIsCleared(false);
            }}
            moveRangeOnFirstSelection={false}
            ranges={range}
          />

          {/* Buttons aligned to calendar width */}
          <div className="flex justify-between w-full mt-3 space-x-2">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
            >
              Cancel
            </button>
            <button
              onClick={handleApply}
              className="flex-1 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              Apply
            </button>
          </div>

          {/* Clear All full width under buttons */}
          <button
            onClick={handleClearAll}
            className="mt-3 px-4 py-2 w-full bg-red-500 text-white rounded hover:bg-red-600"
          >
            Clear All
          </button>
        </div>
      </div>
    </div>
  );
};

export default DateFilterModal;
