import { useState } from "react";

const ReceiptCategoryFilterModel = ({
  onClose,
  onApply,
  initialSelected = [],
}) => {
  const [selectedReceiptCategories, setSelectedReceiptCategories] =
    useState(initialSelected);

  const categoryLabels = {
    0: "Personal",
    1: "Business",
  };
  const fixedCategories = ["0", "1"];

  const toggleCategory = (cat) => {
    setSelectedReceiptCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

  const handleApply = () => {
    const saved = localStorage.getItem("selectedReceiptCategories");
    const prevCategories = saved ? JSON.parse(saved) : [];
    const merged = Array.from(
      new Set([...prevCategories, ...selectedReceiptCategories])
    );
    localStorage.setItem("selectedReceiptCategories", JSON.stringify(merged));
    onApply(selectedReceiptCategories);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50 p-4">
      <div className="bg-white p-4 sm:p-6 rounded-lg shadow-lg w-full max-w-[20rem]">
        <h2 className="text-lg font-semibold mb-4">Select Expense Type</h2>

        <div className="max-h-48 overflow-y-auto">
          {fixedCategories.map((cat) => (
            <label
              key={cat}
              className="flex items-center space-x-2 mb-2 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={selectedReceiptCategories.includes(cat)}
                onChange={() => toggleCategory(cat)}
                style={{ width: "auto" }}
              />
              <span>{categoryLabels[cat] ?? cat}</span>
            </label>
          ))}
        </div>

        <div className="mt-4 flex justify-end space-x-2">
          <button
            onClick={onClose}
            className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300"
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReceiptCategoryFilterModel;
