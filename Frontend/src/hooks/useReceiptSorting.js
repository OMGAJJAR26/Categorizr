import { useState, useCallback, useEffect, useRef } from "react";

const SORT_STORAGE_KEY = 'receiptSortConfig';

// Helper to get initial sort config from localStorage
const getInitialSortConfig = () => {
  const defaultConfig = {
    order: null,
    date: null,
    amount: null,
  };

  try {
    const saved = localStorage.getItem(SORT_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return { ...defaultConfig, ...parsed };
    }
  } catch (error) {
    console.error("Error loading saved sort config:", error);
  }
  return defaultConfig;
};

export const useReceiptSorting = () => {
  const [sortConfig, setSortConfig] = useState(getInitialSortConfig);
  const isInitialMount = useRef(true);

  // Save sort config to localStorage when it changes
  useEffect(() => {
    // Skip on initial mount
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    try {
      localStorage.setItem(SORT_STORAGE_KEY, JSON.stringify(sortConfig));
    } catch (error) {
      console.error("Error saving sort config:", error);
    }
  }, [sortConfig]);

  const updateSort = useCallback((type, value) => {
    setSortConfig(prev => {
      const newConfig = { order: null, date: null, amount: null };
      newConfig[type] = value;
      return newConfig;
    });
  }, []);

  const clearSort = useCallback((type) => {
    setSortConfig(prev => ({
      ...prev,
      [type]: null
    }));
  }, []);

  const clearAllSort = useCallback(() => {
    setSortConfig({
      order: null,
      date: null,
      amount: null,
    });
    localStorage.removeItem(SORT_STORAGE_KEY);
  }, []);

  return {
    sortConfig,
    updateSort,
    clearSort,
    clearAllSort,
  };
};