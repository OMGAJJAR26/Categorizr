import { useState, useMemo, useEffect } from "react";
import { useData } from "../../context/DataContext";
import { buildExpenseCategoryOptions } from "../../utils/expenseCategories";

const ExpenseTypeFilterModel = ({ onClose, onApply, initialSelected = [] }) => {
  const { expenseCategories, apiExpenseCategories, fetchApiExpenseCategories } = useData();
  const [selectedExpenseCategory, setSelectedExpenseCategory] =
    useState(initialSelected);

  useEffect(() => {
    fetchApiExpenseCategories?.();
  }, [fetchApiExpenseCategories]);

  const validCategories = useMemo(
    () =>
      buildExpenseCategoryOptions({
        apiExpenseCategories,
        receiptCategories: expenseCategories,
        includeDefaultsWhenEmpty: true,
      }),
    [apiExpenseCategories, expenseCategories]
  );

  const toggleExpenseCategory = (expenseCategory) => {
    setSelectedExpenseCategory((prev) =>
      prev.includes(expenseCategory)
        ? prev.filter((e) => e !== expenseCategory)
        : [...prev, expenseCategory]
    );
  };

  const handleApply = () => {
    localStorage.setItem(
      "selectedExpenseCategory",
      JSON.stringify(selectedExpenseCategory)
    );
    onApply(selectedExpenseCategory);
    onClose();
  };

  const handleClearAll = () => {
    setSelectedExpenseCategory([]);
    localStorage.removeItem("selectedExpenseCategory");
  };

  const handleSelectAll = () => {
    setSelectedExpenseCategory(validCategories);
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-30 z-50 p-4">
      <div className="bg-white rounded-lg shadow-lg p-4 sm:p-6 w-full max-w-[22rem]">
        <h2 className="text-lg font-semibold mb-4">Select Expense Category</h2>
        <div className="max-h-48 overflow-y-auto">
          {validCategories.length === 0 ? (
            <p className="text-sm text-gray-500 py-2">No expense categories yet.</p>
          ) : (
            validCategories.map((expenseCategory) => (
              <label
                key={expenseCategory}
                className="flex items-center space-x-2 mb-2 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selectedExpenseCategory.includes(expenseCategory)}
                  onChange={() => toggleExpenseCategory(expenseCategory)}
                  style={{ width: "auto" }}
                />
                <span>{expenseCategory}</span>
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

export default ExpenseTypeFilterModel;
