import { useState, useEffect } from "react";
import { useCurrency } from "../../context/CurrencyContext";
import "../../components/filters/TotalFilterModel.css";

function TotalFilterModel({ onApply, onClose, initialSelected = null }) {
  const [selected, setSelected] = useState(null);
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");
  const { getCurrencySymbol } = useCurrency();
  const currencySymbol = getCurrencySymbol();

  const options = [100, 250, 500, 1000];

  // hydrate from initial selection
  useEffect(() => {
    if (!initialSelected) return;
    if (initialSelected.type === "range") {
      setSelected(null);
      setMin(String(initialSelected.min ?? ""));
      setMax(String(initialSelected.max ?? ""));
    } else if (initialSelected.type === "greaterThan") {
      setSelected(Number(initialSelected.value) || 0);
      setMin("");
      setMax("");
    }
  }, [initialSelected]);

  const handleApply = () => {
    let newSelection = null;

    if (min || max) {
      newSelection = {
        type: "range",
        min: min ? Number(min) : 0,
        max: max ? Number(max) : Infinity,
      };
    } else if (selected !== null) {
      newSelection = {
        type: "greaterThan",
        value: Number(selected),
      };
    }

    if (newSelection) {
      localStorage.setItem("selectedPriceFilter", JSON.stringify(newSelection));
      if (onApply) onApply(newSelection);
    }

    onClose();
  };

  const handleClearAll = () => {
    setSelected(null);
    setMin("");
    setMax("");
    localStorage.removeItem("selectedPriceFilter");
    if (onApply) onApply(null);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div
        className="bg-white rounded-lg shadow-lg p-4 sm:p-6 overflow-y-auto w-full max-w-[500px] max-h-[90vh]"
      >
        <h2 className="text-lg font-bold mb-4 text-gray-700">
          Filter by Total
        </h2>

        {/* Range Filter */}
        <div className="mb-10 flex items-center">
          <div style={{ width: "40%" }}>
            <label className="block text-sm text-gray-600 mb-1">
              Minimum ({currencySymbol})
            </label>
            <input
              type="number"
              value={min}
              onChange={(e) => {
                setMin(e.target.value);
                setSelected(null);
              }}
              className="w-full px-3 py-2 border rounded-md text-sm m-0"
            />
          </div>
          <div
            className="text-center text-gray-500 text-sm mb-2"
            style={{ width: "20%", paddingTop: "29px" }}
          >
            To
          </div>
          <div style={{ width: "40%" }}>
            <label className="block text-sm text-gray-600 mb-1">
              Maximum ({currencySymbol})
            </label>
            <input
              type="number"
              value={max}
              onChange={(e) => {
                setMax(e.target.value);
                setSelected(null);
              }}
              className="w-full px-3 py-2 border rounded-md text-sm m-0"
            />
          </div>
        </div>

        <div
          className="text-center text-black text-sm font-bold mt-8 mb-4"
          style={{
            width: "auto",
            backgroundColor: "#ffffff",
            position: "relative",
            display: "table",
            margin: "0 auto",
            padding: "0 20px",
          }}
        >
          OR
        </div>
        <hr style={{ margin: "-10px 0 20px 0" }} />

        {/* Predefined Options */}
        <ul className="space-y-3 mb-4 flex flex-wrap mt-10 filtermodel">
          {options.map((amount) => (
            <li key={amount} style={{ width: "40%", margin: "0" }}>
              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="radio"
                  name="totalFilter"
                  value={amount}
                  checked={selected === amount}
                  onChange={() => {
                    setSelected(amount);
                    setMin("");
                    setMax("");
                  }}
                  className="form-radio text-blue-600"
                  style={{ width: "auto" }}
                />
                <span className="text-sm text-gray-700">
                  Greater than {currencySymbol}
                  {amount}
                </span>
              </label>
            </li>
          ))}
        </ul>

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
  );
}

export default TotalFilterModel;
