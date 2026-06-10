import { useState, useMemo } from "react";
import { useData } from "../../context/DataContext";
import MerchantAvatar from "../MerchantAvatar";

const STORAGE_KEY = "selectedMerchants";

const MerchantFilterModal = ({ onClose, onApply, initialSelected = [] }) => {
  const { homepageFilterMerchantsWithImages, merchantsWithImages } = useData();
  const filterMerchants = homepageFilterMerchantsWithImages ?? merchantsWithImages;

  const [selectedMerchants, setSelectedMerchants] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      const parsed = saved ? JSON.parse(saved) : null;
      return Array.isArray(parsed) ? parsed : initialSelected;
    } catch {
      return initialSelected;
    }
  });

  const normalize = (s = "") =>
    s
      .toString()
      .trim()
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[+\-&,_.:;]/g, " ")
      .replace(/\s+/g, " ")
      .toLowerCase();

  const merchantGroups = useMemo(() => {
    const groups = new Map();

    (filterMerchants || []).forEach((merchant) => {
      const name = merchant.name;
      const normalized = normalize(name);
      if (!groups.has(normalized)) {
        groups.set(normalized, []);
      }
      groups.get(normalized).push(merchant); // Store the full merchant object
    });

    return groups;
  }, [filterMerchants]);

  const uniqueMerchants = useMemo(() => {
    return Array.from(merchantGroups.values())
      .map((group) => group[0]) // Get the first merchant object from each group
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [merchantGroups]);

  const getOriginalMerchants = (displayMerchant) => {
    const normalized = normalize(displayMerchant.name || displayMerchant);
    return merchantGroups.get(normalized) || [displayMerchant];
  };

  const isMerchantSelected = (displayMerchant) => {
    const originalMerchants = getOriginalMerchants(displayMerchant);
    return originalMerchants.some((merchant) =>
      selectedMerchants.includes(merchant.name)
    );
  };

  const toggleMerchant = (displayMerchant) => {
    const originalMerchants = getOriginalMerchants(displayMerchant);
    const isCurrentlySelected = isMerchantSelected(displayMerchant);

    setSelectedMerchants((prev) => {
      if (isCurrentlySelected) {
        return prev.filter((merchantName) => 
          !originalMerchants.some(m => m.name === merchantName)
        );
      } else {
        const newSelection = [...prev];
        originalMerchants.forEach((merchant) => {
          if (!newSelection.includes(merchant.name)) {
            newSelection.push(merchant.name);
          }
        });
        return newSelection;
      }
    });
  };

  const handleSelectAll = () => {
    const allMerchantNames = Array.from(merchantGroups.values())
      .flat()
      .map(merchant => merchant.name);
    setSelectedMerchants(allMerchantNames);
  };

  const handleClearAll = () => {
    setSelectedMerchants([]);
    localStorage.removeItem(STORAGE_KEY);
  };

  const handleApply = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(selectedMerchants));
    
    // Get full merchant data for selected merchants
    const selectedMerchantsData = (filterMerchants || [])
      .filter(merchant => selectedMerchants.includes(merchant.name));
    
    onApply(selectedMerchants, selectedMerchantsData); // Pass both names and data
    onClose();
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-30 z-50 p-4">
      <div
        className="bg-white rounded-lg shadow-lg p-4 sm:p-6 w-full max-w-[31rem]"
      >
        <h2 className="text-lg font-semibold mb-4">Select Merchants</h2>

        <div className="max-h-48 overflow-y-auto">
          {uniqueMerchants.map((merchant) => {
            const originalMerchants = getOriginalMerchants(merchant);
            const hasVariants = originalMerchants.length > 1;

            return (
              <label
                key={merchant.name}
                className="flex items-center space-x-2 mb-2 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={isMerchantSelected(merchant)}
                  onChange={() => toggleMerchant(merchant)}
                  style={{ width: "auto" }}
                />
                <MerchantAvatar
                  name={merchant.name}
                  explicitUrl={merchant.image}
                  className="w-6 h-6"
                  storename={merchant.name}
                />
                <span>
                  {merchant.name}
                  {hasVariants && (
                    <span className="text-xs text-gray-500 ml-1">
                      ({originalMerchants.length} variants)
                    </span>
                  )}
                </span>
              </label>
            );
          })}
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

export default MerchantFilterModal;